import type {
  ContextMode,
  LearningNode,
  MessageRole,
} from '../../shared/contracts.ts'

export type StoredMessage = {
  id: string
  parentId: string | null
  branchId: string
  role: MessageRole
  contentHash: string
  createdAt: string
}

export type BranchRecord = {
  id: string
  parentBranchId: string | null
  baseMessageId: string | null
  headMessageId: string | null
  contextMode: ContextMode
}

export type SessionRecord = {
  id: string
  topic: string
  createdAt: string
  nodes: Map<string, LearningNode>
  branches: Map<string, BranchRecord>
  messages: Map<string, StoredMessage>
}

export type CompiledContextMessage = {
  id: string
  branchId: string
  role: MessageRole
  content: string
}

export type CompiledContext = {
  sessionId: string
  branchId: string
  topic: string
  inherited: boolean
  messages: CompiledContextMessage[]
}

/** 完整的可序列化会话状态，用于持久化与恢复。
 * 相比公开的 LearningSession，额外保留分支指针、消息父链与内容 Blob，
 * 以精确还原不可变 DAG 与上下文隔离语义。
 */
export type SerializableMessage = {
  id: string
  parentId: string | null
  branchId: string
  role: StoredMessage['role']
  contentHash: string
  createdAt: string
}

export type SessionDump = {
  id: string
  topic: string
  createdAt: string
  nodes: LearningNode[]
  branches: Array<{
    id: string
    parentBranchId: string | null
    baseMessageId: string | null
    headMessageId: string | null
    contextMode: ContextMode
  }>
  messages: SerializableMessage[]
  blobs: Array<{
    hash: string
    content: string
    referenceCount: number
  }>
}
