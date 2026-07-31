import type { NodeTone } from '../shared/contracts'

export type {
  CanvasPosition,
  ContextMode,
  LearningNode,
  Message,
  MessageRole,
  NodeStatus,
  NodeTone,
} from '../shared/contracts'

export type AppView = 'home' | 'workspace'

export type WorkspacePanel = 'map' | 'conversation'

export type NodeAction =
  | 'create-branch'
  | 'merge-parent'
  | 'return-parent'
  | 'mark-mastered'

export type RecentProject = {
  id: string
  title: string
  category: string
  tone: Exclude<NodeTone, 'gray'>
  icon: 'brain' | 'leaf' | 'atom'
  progress: number
}
