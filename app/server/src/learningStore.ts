import { randomUUID } from 'node:crypto'
import type {
  CanvasPosition,
  ContextMode,
  ContextTrace,
  CreateBranchResponse,
  LearningNode,
  LearningSession,
  MergeBranchResponse,
  Message,
  MessageRole,
  NodeStatus,
  NodeTone,
  SendMessageResponse,
  UpdateNodeResponse,
} from '../../shared/contracts.ts'
import { compileBranchContext } from './contextCompiler.ts'
import { ContentStore } from './contentStore.ts'
import type {
  BranchRecord,
  CompiledContext,
  SessionDump,
  SessionRecord,
  StoredMessage,
} from './domain.ts'
import { ApiError } from './errors.ts'
import {
  assembleModelInput,
  createOllamaGateway,
  resolveModelFromEnv,
  type ModelGateway,
} from './modelGateway.ts'
import type { SessionPersistor } from './journal.ts'
import {
  buildKnowledgeMap,
  type KnowledgeMap,
} from './knowledgeMap.ts'
import { createSeedNodes } from './seed.ts'

const branchTones: NodeTone[] = ['purple', 'orange', 'green', 'blue']
const validStatuses = new Set<NodeStatus>([
  'current',
  'exploring',
  'mastered',
  'merged',
  'locked',
])

// 合法状态转移表：键为当前状态，值为允许直接切换到的一组状态。
// 用于约束非法的状态跳转，保证学习状态机语义一致。
const statusTransitions: Record<NodeStatus, ReadonlySet<NodeStatus>> = {
  current: new Set(['exploring', 'mastered', 'merged']),
  exploring: new Set(['current', 'mastered', 'merged']),
  mastered: new Set(['exploring', 'merged']),
  merged: new Set(),
  locked: new Set(['exploring']),
}

function assertTransition(
  current: NodeStatus,
  next: NodeStatus,
  nodeLabel: string,
) {
  if (current === next) {
    return
  }
  if (!statusTransitions[current].has(next)) {
    throw new ApiError(
      409,
      'INVALID_STATUS_TRANSITION',
      `节点“${nodeLabel}”不允许从“${current}”切换到“${next}”`,
    )
  }
}

export type CreateBranchInput = {
  title?: string
  contextMode?: ContextMode
}

export type UpdateNodeInput = {
  status?: NodeStatus
  contextMode?: ContextMode
  position?: CanvasPosition
}

export type LearningStoreOptions = {
  /** 模型网关；缺省时创建本地 Ollama 网关（模型由 ZHIZHI_MODEL 配置）。 */
  modelGateway?: ModelGateway
  /** 会话持久化器；提供时将每个 mutation 后的最新会话快照写入持久层。 */
  persistor?: SessionPersistor
}

export class LearningStore {
  private readonly sessions = new Map<string, SessionRecord>()
  readonly contentStore = new ContentStore()
  private readonly modelGateway: ModelGateway
  private readonly persistor?: SessionPersistor

  constructor(options: LearningStoreOptions = {}) {
    this.modelGateway = options.modelGateway ?? createDefaultGateway()
    this.persistor = options.persistor
  }

  createSession(topic: string): LearningSession {
    const normalizedTopic = topic.trim()
    if (!normalizedTopic) {
      throw new ApiError(400, 'TOPIC_REQUIRED', '学习主题不能为空')
    }

    const session: SessionRecord = {
      id: randomUUID(),
      topic: normalizedTopic,
      createdAt: new Date().toISOString(),
      nodes: new Map(),
      branches: new Map(),
      messages: new Map(),
    }

    createSeedNodes(normalizedTopic).forEach((seedNode) => {
      const parentBranch = seedNode.parentId
        ? session.branches.get(seedNode.parentId)
        : null
      if (seedNode.parentId && !parentBranch) {
        throw new ApiError(500, 'INVALID_SEED', '初始分支顺序无效')
      }

      const baseMessageId = parentBranch?.headMessageId ?? null
      const branch: BranchRecord = {
        id: seedNode.id,
        parentBranchId: seedNode.parentId,
        baseMessageId,
        headMessageId: baseMessageId,
        contextMode: seedNode.contextMode,
      }
      const { messages, ...node } = seedNode

      session.nodes.set(node.id, node)
      session.branches.set(branch.id, branch)
      messages.forEach((message) => {
        this.appendMessage(session, branch.id, message.role, message.content)
      })
    })

    this.sessions.set(session.id, session)
    return this.toSnapshot(session)
  }

  getSession(sessionId: string): LearningSession {
    return this.toSnapshot(this.requireSession(sessionId))
  }

  createBranch(
    sessionId: string,
    sourceNodeId: string,
    input: CreateBranchInput = {},
  ): CreateBranchResponse {
    const session = this.requireSession(sessionId)
    const sourceNode = this.requireNode(session, sourceNodeId)
    const sourceBranch = this.requireBranch(session, sourceNodeId)

    if (sourceNode.status === 'locked') {
      throw new ApiError(409, 'NODE_LOCKED', '待解锁节点不能创建分支')
    }
    if (
      input.contextMode !== undefined &&
      input.contextMode !== 'inherit' &&
      input.contextMode !== 'isolated'
    ) {
      throw new ApiError(400, 'INVALID_CONTEXT_MODE', '上下文模式无效')
    }

    const siblings = [...session.nodes.values()].filter(
      (node) => node.parentId === sourceNode.id,
    )
    const branchNumber = siblings.length + 1
    const horizontalDirection = siblings.length % 2 === 0 ? -1 : 1
    const nodeId = `branch-${randomUUID()}`
    const tone = branchTones[siblings.length % branchTones.length]
    const contextMode = input.contextMode ?? 'isolated'
    const node: LearningNode = {
      id: nodeId,
      parentId: sourceNode.id,
      title: input.title?.trim() || `新概念分支 ${branchNumber}`,
      summary: `从“${sourceNode.title}”独立探索的新问题。`,
      status: 'current',
      tone,
      position: {
        x:
          sourceNode.position.x +
          horizontalDirection * (136 + siblings.length * 20),
        y: sourceNode.position.y + 172,
      },
      contextMode,
    }
    const branch: BranchRecord = {
      id: nodeId,
      parentBranchId: sourceNode.id,
      baseMessageId: sourceBranch.headMessageId,
      headMessageId: sourceBranch.headMessageId,
      contextMode,
    }

    session.nodes.forEach((currentNode, currentNodeId) => {
      if (currentNode.status === 'current') {
        session.nodes.set(currentNodeId, {
          ...currentNode,
          status: 'exploring',
        })
      }
    })
    session.nodes.set(node.id, node)
    session.branches.set(branch.id, branch)

    const message = this.appendMessage(
      session,
      node.id,
      'assistant',
      contextMode === 'isolated'
        ? '新分支已经创建。这里不会读取父节点和同级分支的原始对话，合并时只会带回整理后的结论。'
        : '新分支已经创建。这里会继承创建时的父节点上下文，但不会读取同级分支的对话。',
    )

    return {
      node: { ...node },
      sourceNode: { ...this.requireNode(session, sourceNodeId) },
      message,
    }
  }

  updateNode(
    sessionId: string,
    nodeId: string,
    input: UpdateNodeInput,
  ): UpdateNodeResponse {
    const session = this.requireSession(sessionId)
    const node = this.requireNode(session, nodeId)
    const branch = this.requireBranch(session, nodeId)

    if (input.status && !validStatuses.has(input.status)) {
      throw new ApiError(400, 'INVALID_STATUS', '节点状态无效')
    }
    if (input.status) {
      assertTransition(node.status, input.status, node.title)
    }
    if (
      input.contextMode &&
      input.contextMode !== 'inherit' &&
      input.contextMode !== 'isolated'
    ) {
      throw new ApiError(400, 'INVALID_CONTEXT_MODE', '上下文模式无效')
    }
    if (
      input.position &&
      (!Number.isFinite(input.position.x) ||
        !Number.isFinite(input.position.y))
    ) {
      throw new ApiError(400, 'INVALID_POSITION', '节点坐标无效')
    }

    const updatedNode: LearningNode = {
      ...node,
      ...(input.status ? { status: input.status } : {}),
      ...(input.contextMode ? { contextMode: input.contextMode } : {}),
      ...(input.position ? { position: input.position } : {}),
    }
    session.nodes.set(nodeId, updatedNode)

    if (input.contextMode) {
      session.branches.set(nodeId, {
        ...branch,
        contextMode: input.contextMode,
      })
    }

    return { node: { ...updatedNode } }
  }

  /** 将待解锁节点解锁为探索状态，并返回更新后的节点。 */
  unlockNode(sessionId: string, nodeId: string): UpdateNodeResponse {
    const session = this.requireSession(sessionId)
    const node = this.requireNode(session, nodeId)

    if (node.status !== 'locked') {
      throw new ApiError(409, 'NODE_NOT_LOCKED', '只有待解锁节点才能解锁')
    }

    const updatedNode: LearningNode = {
      ...node,
      status: 'exploring',
    }
    session.nodes.set(nodeId, updatedNode)
    return { node: { ...updatedNode } }
  }

  /** 返回指定会话的概念知识地图。 */
  getKnowledgeMap(sessionId: string): KnowledgeMap {
    const session = this.requireSession(sessionId)
    return buildKnowledgeMap(this.toSnapshot(session))
  }

  async sendMessage(
    sessionId: string,
    nodeId: string,
    content: string,
  ): Promise<SendMessageResponse> {
    const session = this.requireSession(sessionId)
    const node = this.requireNode(session, nodeId)
    const normalizedContent = content.trim()

    if (!normalizedContent) {
      throw new ApiError(400, 'MESSAGE_REQUIRED', '消息内容不能为空')
    }
    if (node.status === 'locked') {
      throw new ApiError(409, 'NODE_LOCKED', '待解锁节点不能发送消息')
    }

    const userMessage = this.appendMessage(
      session,
      nodeId,
      'user',
      normalizedContent,
    )
    const compiledContext = compileBranchContext(
      session,
      this.contentStore,
      nodeId,
    )

    let reply: string
    try {
      reply = await this.modelGateway.complete(
        assembleModelInput(compiledContext, normalizedContent),
      )
    } catch {
      // 模型不可用或生成失败时，回退到本地规则模板，保证后端可用。
      reply = createLocalResponse(
        normalizedContent,
        node.title,
        compiledContext.messages.length,
      )
    }

    const assistantMessage = this.appendMessage(
      session,
      nodeId,
      'assistant',
      reply,
    )

    return {
      userMessage,
      assistantMessage,
      contextTrace: toContextTrace(compiledContext),
    }
  }

  mergeBranch(
    sessionId: string,
    sourceNodeId: string,
  ): MergeBranchResponse {
    const session = this.requireSession(sessionId)
    const sourceNode = this.requireNode(session, sourceNodeId)

    if (!sourceNode.parentId) {
      throw new ApiError(409, 'ROOT_CANNOT_MERGE', '根节点不能向上合并')
    }
    if (sourceNode.status === 'locked') {
      throw new ApiError(409, 'NODE_LOCKED', '待解锁节点不能合并')
    }
    if (sourceNode.status === 'merged') {
      throw new ApiError(409, 'BRANCH_ALREADY_MERGED', '分支已经合并')
    }
    assertTransition(sourceNode.status, 'merged', sourceNode.title)

    const parentNode = this.requireNode(session, sourceNode.parentId)
    const localMessageCount = [...session.messages.values()].filter(
      (message) => message.branchId === sourceNode.id,
    ).length
    const message = this.appendMessage(
      session,
      parentNode.id,
      'assistant',
      `已合并来自“${sourceNode.title}”的结论：${sourceNode.summary}（整理自 ${localMessageCount} 条分支消息）`,
    )
    const updatedSource: LearningNode = {
      ...sourceNode,
      status: 'merged',
    }
    const updatedParent: LearningNode = {
      ...parentNode,
      status:
        parentNode.status === 'exploring' ? 'current' : parentNode.status,
    }

    session.nodes.set(updatedSource.id, updatedSource)
    session.nodes.set(updatedParent.id, updatedParent)

    return {
      sourceNode: { ...updatedSource },
      parentNode: { ...updatedParent },
      message,
    }
  }

  getCompiledContext(
    sessionId: string,
    nodeId: string,
  ): CompiledContext {
    const session = this.requireSession(sessionId)
    this.requireNode(session, nodeId)
    return compileBranchContext(session, this.contentStore, nodeId)
  }

  /**
   * 将指定会话的最新完整快照写入持久层；未配置持久化器时为空操作。
   * 供外部在每次 mutation 后调用，实现进程重启后的恢复。
   */
  async persistSession(sessionId: string): Promise<void> {
    if (!this.persistor) {
      return
    }
    await this.persistor.persist(this.serializeSession(sessionId))
  }

  /** 将指定会话序列化为可持久化的完整状态。 */
  serializeSession(sessionId: string): SessionDump {
    const session = this.requireSession(sessionId)
    return {
      id: session.id,
      topic: session.topic,
      createdAt: session.createdAt,
      nodes: [...session.nodes.values()].map((node) => ({ ...node })),
      branches: [...session.branches.values()].map((branch) => ({ ...branch })),
      messages: [...session.messages.values()].map((message) => ({ ...message })),
      blobs: this.contentStore.toSerializedBlobs(),
    }
  }

  /** 从持久化的完整快照恢复一个会话，返回其公开快照。 */
  restoreSession(dump: SessionDump): LearningSession {
    if (this.sessions.has(dump.id)) {
      throw new ApiError(409, 'SESSION_EXISTS', '会话已存在，无法重复恢复')
    }

    this.contentStore.hydrate(dump.blobs)
    const session: SessionRecord = {
      id: dump.id,
      topic: dump.topic,
      createdAt: dump.createdAt,
      nodes: new Map(dump.nodes.map((node) => [node.id, { ...node }])),
      branches: new Map(dump.branches.map((branch) => [branch.id, { ...branch }])),
      messages: new Map(dump.messages.map((message) => [message.id, { ...message }])),
    }
    this.sessions.set(dump.id, session)
    return this.toSnapshot(session)
  }

  private appendMessage(
    session: SessionRecord,
    branchId: string,
    role: MessageRole,
    content: string,
  ): Message {
    const branch = this.requireBranch(session, branchId)
    const message: StoredMessage = {
      id: randomUUID(),
      parentId: branch.headMessageId,
      branchId,
      role,
      contentHash: this.contentStore.add(content),
      createdAt: '刚刚',
    }

    session.messages.set(message.id, message)
    session.branches.set(branchId, {
      ...branch,
      headMessageId: message.id,
    })

    return this.toMessage(message)
  }

  private toSnapshot(session: SessionRecord): LearningSession {
    return {
      id: session.id,
      topic: session.topic,
      nodes: [...session.nodes.values()].map((node) => ({ ...node })),
      messages: [...session.messages.values()].map((message) =>
        this.toMessage(message),
      ),
      createdAt: session.createdAt,
    }
  }

  private toMessage(message: StoredMessage): Message {
    return {
      id: message.id,
      nodeId: message.branchId,
      role: message.role,
      content: this.contentStore.get(message.contentHash),
      createdAt: message.createdAt,
    }
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', '学习会话不存在')
    }
    return session
  }

  private requireNode(session: SessionRecord, nodeId: string) {
    const node = session.nodes.get(nodeId)
    if (!node) {
      throw new ApiError(404, 'NODE_NOT_FOUND', '学习节点不存在')
    }
    return node
  }

  private requireBranch(session: SessionRecord, branchId: string) {
    const branch = session.branches.get(branchId)
    if (!branch) {
      throw new ApiError(404, 'BRANCH_NOT_FOUND', '学习分支不存在')
    }
    return branch
  }
}

function toContextTrace(context: CompiledContext): ContextTrace {
  return {
    messageIds: context.messages.map((message) => message.id),
    branchIds: [...new Set(context.messages.map((message) => message.branchId))],
    inherited: context.inherited,
  }
}

function createDefaultGateway(): ModelGateway {
  return createOllamaGateway({
    model: resolveModelFromEnv(process.env),
  })
}

function createLocalResponse(
  prompt: string,
  nodeTitle: string,
  contextMessageCount: number,
) {
  if (prompt.includes('例子')) {
    return `用一个最小例子理解「${nodeTitle}」：先只保留两个对象，观察其中一个对象如何根据当前目标，从另一个对象取回有用信息。当前回答只使用了这条分支可见的 ${contextMessageCount} 条上下文。`
  }
  if (prompt.includes('检查')) {
    return `试着用一句自己的话回答：在「${nodeTitle}」里，输入、关联依据和最终得到的信息分别是什么？这次检查不会读取同级分支。`
  }
  if (prompt.includes('类比')) {
    return `可以把「${nodeTitle}」想成在书架前带着问题找资料：问题决定你先看哪些书，书的标签帮助判断相关性，真正带走的是书里的内容。`
  }
  return `你问到了「${nodeTitle}」里的关键连接。可以先把问题拆成“它解决什么”“它如何工作”“怎样验证”三步。当前上下文来自这条分支可见的 ${contextMessageCount} 条消息。`
}
