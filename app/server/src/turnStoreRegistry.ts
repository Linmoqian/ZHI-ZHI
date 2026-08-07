// 回合树会话注册表：管理多个 TurnSessionStore 的生命周期与持久化。
//
// 职责：
// - 创建/获取/列举/恢复会话
// - 每个会话有独立的内容仓库（内容寻址按会话隔离）
// - 共享模型网关与持久化器
// - 启动时从持久化器恢复已有会话

import type { TurnDTO, TurnSessionDTO, TurnSessionSummary } from '../../shared/contracts.ts'
import { ApiError } from './errors.ts'
import { ContentStore } from './contentStore.ts'
import type { ModelGateway } from './modelGateway.ts'
import { TurnSessionStore } from './turnStore.ts'
import type { TurnPersistor } from './turnJournal.ts'

export type TurnStoreRegistryOptions = {
  modelGateway?: ModelGateway
  persistor?: TurnPersistor
}

export class TurnStoreRegistry {
  private readonly sessions = new Map<string, TurnSessionStore>()
  private readonly modelGateway: ModelGateway
  private readonly persistor?: TurnPersistor

  constructor(options: TurnStoreRegistryOptions = {}) {
    this.modelGateway = options.modelGateway ?? createNoopGateway()
    this.persistor = options.persistor
  }

  /** 创建新会话（根回合）。 */
  async createSession(userContent: string): Promise<TurnSessionStore> {
    const normalized = userContent.trim()
    if (!normalized) {
      throw new ApiError(400, 'MESSAGE_REQUIRED', '用户输入不能为空')
    }

    const contentStore = new ContentStore()
    const store = await TurnSessionStore.create(
      normalized,
      normalized,
      contentStore,
      this.storeOptions(),
    )
    await store.persist()
    this.sessions.set(store.id, store)
    return store
  }

  /** 获取会话；未在内存时尝试从持久化器恢复。 */
  async getSession(sessionId: string): Promise<TurnSessionStore> {
    const cached = this.sessions.get(sessionId)
    if (cached) {
      return cached
    }
    if (!this.persistor) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', '学习会话不存在')
    }
    const dump = await this.persistor.load(sessionId)
    if (!dump) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', '学习会话不存在')
    }
    const restored = TurnSessionStore.restore(
      dump,
      new ContentStore(),
      this.storeOptions(),
    )
    this.sessions.set(restored.id, restored)
    return restored
  }

  /** 列举所有会话（首页最近学习）。 */
  async listSessions(): Promise<TurnSessionSummary[]> {
    const ids = this.persistor
      ? await this.persistor.listSessionIds()
      : [...this.sessions.keys()]
    const summaries: TurnSessionSummary[] = []
    for (const id of ids) {
      const store = await this.getSession(id)
      summaries.push({
        id: store.id,
        topic: store.topic,
        createdAt: store.createdAt,
        turnCount: store.listTurns().length,
      })
    }
    // 新会话优先，id 作为确定性平局决胜
    summaries.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )
    return summaries
  }

  /** 将会话序列化为可传输对象。 */
  toSessionDTO(store: TurnSessionStore): TurnSessionDTO {
    const turns = store.listTurns()
    return {
      id: store.id,
      topic: store.topic,
      createdAt: store.createdAt,
      turns: turns.map((turn) => ({
        id: turn.id,
        parentId: turn.parentId,
        userContent: store.contentStore.get(turn.userContentHash),
        assistantContent: store.contentStore.get(turn.assistantContentHash),
        createdAt: turn.createdAt,
      })),
    }
  }

  /** 将单个回合序列化为可传输对象。 */
  toTurnDTO(
    store: TurnSessionStore,
    turnId: string,
  ): TurnDTO {
    const turn = store.listTurns().find((t) => t.id === turnId)
    if (!turn) {
      throw new ApiError(404, 'TURN_NOT_FOUND', '回合不存在')
    }
    return {
      id: turn.id,
      parentId: turn.parentId,
      userContent: store.contentStore.get(turn.userContentHash),
      assistantContent: store.contentStore.get(turn.assistantContentHash),
      createdAt: turn.createdAt,
    }
  }

  private storeOptions() {
    return {
      modelGateway: this.modelGateway,
      persistor: this.persistor,
    }
  }
}

/** 默认网关占位：未配置模型网关时返回明确错误，避免静默失败。 */
function createNoopGateway(): ModelGateway {
  const fail = () =>
    Promise.reject(new Error('未配置模型网关（ZHIZHI_MODEL / Ollama 不可用）'))
  return {
    complete: fail,
    summarize: () => Promise.resolve('（模型未配置）'),
  }
}
