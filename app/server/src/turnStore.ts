// 回合树会话存储：一棵随消息生长的回合树。
//
// 一个回合 = 一次用户输入 + 一次模型输出；回合间通过 parentId 形成树。
// 上下文 = 从叶到根的唯一路径，分叉即隔离，无需 inherit/isolated 开关。
// 详见 docs/回合树重构.md。

import { randomUUID } from 'node:crypto'
import type {
  CompiledTurn,
  CompiledTurnContext,
  TurnNode,
  TurnSessionDump,
} from './domain.ts'
import { ApiError } from './errors.ts'
import {
  assembleModelInput,
  type ModelGateway,
} from './modelGateway.ts'
import type { ContentStore } from './contentStore.ts'
import type {
  SerializedTurn,
  TurnJournalEvent,
  TurnPersistor,
} from './turnJournal.ts'
import { toSerializedTurn } from './turnJournal.ts'

/** 追加回合的输入：指定从哪个父回合继续生长。 */
export type AppendTurnInput = {
  parentId: string
  userContent: string
}

/** 从模型生成的回复；与上下文一同组装成模型输入。 */
export type ForkTurnInput = {
  /** 分叉点的父回合 id。 */
  parentId: string
  userContent: string
}

export type TurnStoreOptions = {
  modelGateway: ModelGateway
  /** 可选的持久化器；提供后每次变更会累积事件并按需落盘。 */
  persistor?: TurnPersistor
}

const RECENT_TURN_LIMIT = 12

/**
 * 回合树会话存储。每个会话维护一棵回合树，所有树操作 O(1) 写入
 * （追加回合只新增节点 + 更新派生 childIndex）。
 */
export class TurnSessionStore {
  readonly contentStore: ContentStore
  private readonly modelGateway: ModelGateway
  private readonly persistor: TurnPersistor | null
  /** 自上次落盘以来累积的事件；persist 时一并提交并清空。 */
  private readonly pendingEvents: TurnJournalEvent[] = []
  private readonly turns = new Map<string, TurnNode>()
  /** 派生索引：parentId → 子回合 id 列表。从 turns 重建，不持久化。 */
  private readonly childIndex = new Map<string, string[]>()
  private rootTurnId: string | null = null

  constructor(
    topic: string,
    sessionId: string,
    createdAt: string,
    contentStore: ContentStore,
    options: TurnStoreOptions,
  ) {
    this.id = sessionId
    this.topic = topic
    this.createdAt = createdAt
    this.contentStore = contentStore
    this.modelGateway = options.modelGateway
    this.persistor = options.persistor ?? null
  }

  readonly id: string
  topic: string
  readonly createdAt: string

  /** 创建会话的根回合（首轮 user 输入 + 模型回复）。 */
  static async create(
    topic: string,
    userContent: string,
    contentStore: ContentStore,
    options: TurnStoreOptions,
  ): Promise<TurnSessionStore> {
    const sessionId = randomUUID()
    const createdAt = new Date().toISOString()
    const store = new TurnSessionStore(
      topic.trim() || userContent,
      sessionId,
      createdAt,
      contentStore,
      options,
    )

    const normalizedUser = userContent.trim()
    if (!normalizedUser) {
      throw new ApiError(400, 'MESSAGE_REQUIRED', '用户输入不能为空')
    }

    const userHash = store.contentStore.add(normalizedUser)
    const assistantContent = await store.generateReply(
      normalizedUser,
      [],
      topic,
    )
    const assistantHash = store.contentStore.add(assistantContent)

    const rootTurn: TurnNode = {
      id: randomUUID(),
      parentId: null,
      userContentHash: userHash,
      assistantContentHash: assistantHash,
      createdAt,
    }
    store.turns.set(rootTurn.id, rootTurn)
    store.rootTurnId = rootTurn.id
    store.recordAppend(rootTurn, normalizedUser, assistantContent)
    return store
  }

  /** 从序列化快照恢复会话（不触发模型调用）。 */
  static restore(
    dump: TurnSessionDump,
    contentStore: ContentStore,
    options: TurnStoreOptions,
  ): TurnSessionStore {
    contentStore.hydrate(dump.blobs)
    const store = new TurnSessionStore(
      dump.topic,
      dump.id,
      dump.createdAt,
      contentStore,
      options,
    )
    for (const turn of dump.turns) {
      const node: TurnNode = {
        id: turn.id,
        parentId: turn.parentId,
        userContentHash: turn.userContentHash,
        assistantContentHash: turn.assistantContentHash,
        createdAt: turn.createdAt,
      }
      store.turns.set(node.id, node)
      if (node.parentId === null) {
        store.rootTurnId = node.id
      } else {
        store.addToIndex(node.parentId, node.id)
      }
    }
    return store
  }

  /** 在某回合后追加子回合（生长）。 */
  async appendTurn(input: AppendTurnInput): Promise<TurnNode> {
    const parent = this.requireTurn(input.parentId)
    const normalizedContent = input.userContent.trim()
    if (!normalizedContent) {
      throw new ApiError(400, 'MESSAGE_REQUIRED', '用户输入不能为空')
    }

    const context = this.compileContext(parent.id)
    const assistantContent = await this.generateReply(
      normalizedContent,
      context.turns,
      this.topic,
    )

    return this.addTurn(parent.id, normalizedContent, assistantContent)
  }

  /** 在某回合后分叉出新子回合（成为兄弟）。语义上与 appendTurn 相同：
   * 都是「在某父回合后长出一个新子回合」。分叉即隔离自动成立。 */
  async forkTurn(input: ForkTurnInput): Promise<TurnNode> {
    return this.appendTurn(input)
  }

  /** 编辑回合内容（user 或 assistant 文本变更）。 */
  updateTurn(
    turnId: string,
    patch: { userContent?: string; assistantContent?: string },
  ): TurnNode {
    const turn = this.requireTurn(turnId)
    const updated: TurnNode = { ...turn }

    if (patch.userContent !== undefined) {
      const normalized = patch.userContent.trim()
      if (!normalized) {
        throw new ApiError(400, 'MESSAGE_REQUIRED', '用户输入不能为空')
      }
      updated.userContentHash = this.contentStore.add(normalized)
    }
    if (patch.assistantContent !== undefined) {
      const normalized = patch.assistantContent.trim()
      if (!normalized) {
        throw new ApiError(400, 'MESSAGE_REQUIRED', '模型输出不能为空')
      }
      updated.assistantContentHash = this.contentStore.add(normalized)
    }

    this.turns.set(turnId, updated)
    this.recordUpdate(updated, {
      userContent: patch.userContent?.trim(),
      assistantContent: patch.assistantContent?.trim(),
    })
    return updated
  }

  /** 从叶回合沿 parentId 回溯到根，编译纯净上下文。 */
  compileContext(
    leafTurnId: string,
    recentLimit = RECENT_TURN_LIMIT,
  ): CompiledTurnContext {
    this.requireTurn(leafTurnId)

    const path: TurnNode[] = []
    const visited = new Set<string>()
    let cursorId: string | null = leafTurnId

    while (cursorId) {
      if (visited.has(cursorId)) {
        throw new ApiError(500, 'TURN_CYCLE', '回合链出现循环引用')
      }
      const turn = this.turns.get(cursorId)
      if (!turn) {
        throw new ApiError(500, 'TURN_NOT_FOUND', '回合链引用已丢失')
      }
      visited.add(cursorId)
      path.push(turn)
      cursorId = turn.parentId
    }

    // 根 → 叶的时间序
    const chronological = path.reverse()
    const turns: CompiledTurn[] = chronological.map((turn) => ({
      id: turn.id,
      parentId: turn.parentId,
      userContent: this.contentStore.get(turn.userContentHash),
      assistantContent: this.contentStore.get(turn.assistantContentHash),
      createdAt: turn.createdAt,
    }))

    // 近期保留原文，远端历史后续由调用方按需压缩（此处先返回完整路径）。
    void recentLimit
    return {
      sessionId: this.id,
      leafTurnId,
      topic: this.topic,
      turns,
    }
  }

  /** 返回所有回合（用于地图渲染 / 序列化）。 */
  listTurns(): TurnNode[] {
    return [...this.turns.values()]
  }

  /** 返回某回合的所有子回合（地图渲染分叉点）。 */
  childrenOf(turnId: string): TurnNode[] {
    return (this.childIndex.get(turnId) ?? []).map((id) => this.turns.get(id)!)
  }

  /** 返回根回合 id。 */
  get rootId(): string | null {
    return this.rootTurnId
  }

  /** 序列化为可持久化的完整快照。 */
  serialize(): TurnSessionDump {
    return {
      id: this.id,
      topic: this.topic,
      createdAt: this.createdAt,
      turns: this.listTurns().map((turn) => ({ ...turn })),
      blobs: this.contentStore.toSerializedBlobs(),
    }
  }

  /** 将累积的事件提交给持久化器。未配置 persistor 时为空操作。 */
  async persist(): Promise<void> {
    if (!this.persistor || this.pendingEvents.length === 0) {
      return
    }
    const events = this.pendingEvents.splice(0)
    await this.persistor.append(this.id, events, () => this.serialize())
  }

  // ------------------------------------------------------------------
  // 私有辅助
  // ------------------------------------------------------------------

  private addTurn(
    parentId: string,
    userContent: string,
    assistantContent: string,
  ): TurnNode {
    const turn: TurnNode = {
      id: randomUUID(),
      parentId,
      userContentHash: this.contentStore.add(userContent),
      assistantContentHash: this.contentStore.add(assistantContent),
      createdAt: new Date().toISOString(),
    }
    this.turns.set(turn.id, turn)
    this.addToIndex(parentId, turn.id)
    this.recordAppend(turn, userContent, assistantContent)
    return turn
  }

  /** 记录回合新增事件（生长 / 分叉）。 */
  private recordAppend(
    turn: TurnNode,
    userContent: string,
    assistantContent: string,
  ): void {
    const serialized: SerializedTurn = toSerializedTurn(turn)
    this.pendingEvents.push({
      type: 'turn_appended',
      sessionId: this.id,
      turn: serialized,
      userContent,
      assistantContent,
      createdAt: turn.createdAt,
    })
  }

  /** 记录回合内容变更事件。 */
  private recordUpdate(
    turn: TurnNode,
    contents: { userContent?: string; assistantContent?: string },
  ): void {
    const serialized: SerializedTurn = toSerializedTurn(turn)
    this.pendingEvents.push({
      type: 'turn_updated',
      sessionId: this.id,
      turn: serialized,
      userContent: contents.userContent,
      assistantContent: contents.assistantContent,
    })
  }

  private addToIndex(parentId: string, childId: string) {
    const siblings = this.childIndex.get(parentId) ?? []
    siblings.push(childId)
    this.childIndex.set(parentId, siblings)
  }

  private requireTurn(turnId: string): TurnNode {
    const turn = this.turns.get(turnId)
    if (!turn) {
      throw new ApiError(404, 'TURN_NOT_FOUND', '回合不存在')
    }
    return turn
  }

  /** 组装模型输入并生成回复；失败时回退到本地占位回复。 */
  private async generateReply(
    userContent: string,
    contextTurns: CompiledTurn[],
    topic: string,
  ): Promise<string> {
    try {
      const modelInput = assembleModelInput(
        topic,
        contextTurns,
        userContent,
      )
      return await this.modelGateway.complete(modelInput)
    } catch {
      // 模型不可用时回退到占位回复，保证会话可用。
      return `（模型暂不可用）关于「${topic}」的占位回复。`
    }
  }
}
