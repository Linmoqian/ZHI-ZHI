export type AppView = 'home' | 'workspace'

export type WorkspacePanel = 'map' | 'conversation'

export type NodeAction =
  | 'create-branch'
  | 'merge-parent'
  | 'return-parent'
  | 'mark-mastered'

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

export type RecentProject = {
  id: string
  title: string
  category: string
  tone: Exclude<NodeTone, 'gray'>
  icon: 'brain' | 'leaf' | 'atom'
  progress: number
}
