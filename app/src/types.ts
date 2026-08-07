import type {} from '../shared/contracts'

export type {
  CanvasPosition,
  ContextMode,
  LearningNode,
  Message,
  MessageRole,
  NodeStatus,
  NodeTone,
  SessionSummary,
} from '../shared/contracts'

export type { PixelIconName } from './components/PixelIcon'

export type AppView = 'home' | 'workspace'

export type WorkspacePanel = 'map' | 'conversation'

export type NodeAction =
  | 'create-branch'
  | 'clone-branch'
  | 'merge-parent'
  | 'return-parent'
  | 'mark-mastered'
