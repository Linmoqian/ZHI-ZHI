import type {
  CanvasPosition,
  ContextMode,
  LearningNode,
  Message,
  NodeAction,
  WorkspacePanel,
} from '../types'
import { BranchMap } from './BranchMap'
import { ConversationPanel } from './ConversationPanel'
import { PixelIcon } from './PixelIcon'

type WorkspaceViewProps = {
  topic: string
  nodes: LearningNode[]
  messages: Message[]
  currentNode: LearningNode
  currentPanel: WorkspacePanel
  isGenerating: boolean
  onPanelChange: (panel: WorkspacePanel) => void
  onBackHome: () => void
  onSelectNode: (nodeId: string) => void
  onMoveNode: (nodeId: string, position: CanvasPosition) => void
  onNodeAction: (nodeId: string, action: NodeAction) => void
  onSendMessage: (content: string) => void
  onContextModeChange: (nodeId: string, mode: ContextMode) => void
}

const panelTabs: { id: WorkspacePanel; label: string }[] = [
  { id: 'map', label: '地图' },
  { id: 'conversation', label: '对话' },
]

export function WorkspaceView({
  topic,
  nodes,
  messages,
  currentNode,
  currentPanel,
  isGenerating,
  onPanelChange,
  onBackHome,
  onSelectNode,
  onMoveNode,
  onNodeAction,
  onSendMessage,
  onContextModeChange,
}: WorkspaceViewProps) {
  const parent =
    nodes.find((node) => node.id === currentNode.parentId) ?? null
  const currentMessages = messages.filter(
    (message) => message.nodeId === currentNode.id,
  )

  return (
    <main className="workspace-view">
      <header className="workspace-topbar">
        <button
          className="back-home-button"
          type="button"
          onClick={onBackHome}
        >
          <PixelIcon name="chevron-left" />
          返回学习首页
        </button>
        <div className="workspace-topic">
          <span className="eyebrow">ACTIVE LEARNING PATH</span>
          <strong>{topic}</strong>
        </div>
        <div className="save-state">
          <span />
          本地原型 · 已同步
        </div>
      </header>

      <div className="mobile-panel-tabs" role="tablist" aria-label="工作区面板">
        {panelTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={currentPanel === tab.id}
            className={currentPanel === tab.id ? 'is-active' : ''}
            onClick={() => onPanelChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`workspace-grid active-panel-${currentPanel}`}>
        <BranchMap
          nodes={nodes}
          currentNodeId={currentNode.id}
          onSelectNode={onSelectNode}
          onMoveNode={onMoveNode}
          onNodeAction={onNodeAction}
          onContextModeChange={onContextModeChange}
        />
        <ConversationPanel
          node={currentNode}
          parent={parent}
          messages={currentMessages}
          isGenerating={isGenerating}
          onSendMessage={onSendMessage}
        />
      </div>
    </main>
  )
}
