export type NodeStatus =
  | 'current'
  | 'exploring'
  | 'mastered'
  | 'merged'
  | 'locked'

export type NodeTone = 'blue' | 'green' | 'purple' | 'orange' | 'gray'

export type ContextMode = 'inherit' | 'isolated'

export type CanvasPosition = {
  x: number
  y: number
}

export type LearningNode = {
  id: string
  parentId: string | null
  title: string
  summary: string
  status: NodeStatus
  tone: NodeTone
  position: CanvasPosition
  contextMode: ContextMode
}

export type MessageRole = 'assistant' | 'user'

export type Message = {
  id: string
  nodeId: string
  role: MessageRole
  content: string
  createdAt: string
}

export type LearningSession = {
  id: string
  topic: string
  nodes: LearningNode[]
  messages: Message[]
  createdAt: string
}

export type ContextTrace = {
  messageIds: string[]
  branchIds: string[]
  inherited: boolean
}

export type CreateSessionResponse = {
  session: LearningSession
}

export type CreateBranchResponse = {
  node: LearningNode
  sourceNode: LearningNode
  message: Message
}

export type CloneBranchResponse = {
  node: LearningNode
  sourceNode: LearningNode
  message: Message
}

export type SessionSummary = {
  id: string
  topic: string
  createdAt: string
  nodeCount: number
  completedNodes: number
}

export type ListSessionsResponse = {
  sessions: SessionSummary[]
}

export type SendMessageResponse = {
  userMessage: Message
  assistantMessage: Message
  contextTrace: ContextTrace
  /** 发送消息后更新的节点（如 summary 已重新概括）。 */
  updatedNode?: LearningNode
}

export type UpdateNodeResponse = {
  node: LearningNode
}

export type MergeBranchResponse = {
  sourceNode: LearningNode
  parentNode: LearningNode
  message: Message
}

export type ApiErrorPayload = {
  error: {
    code: string
    message: string
  }
}
