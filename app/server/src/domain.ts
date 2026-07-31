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
