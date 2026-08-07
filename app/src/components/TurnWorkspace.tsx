import { useState } from 'react'
import type { TurnDTO, WorkspacePanel } from '../types'
import { PixelIcon } from './PixelIcon'
import { SplitPane } from './SplitPane'
import { TurnMap } from './TurnMap'
import { TurnConversation } from './TurnConversation'

type TurnWorkspaceProps = {
  turns: TurnDTO[]
  activeLeafId: string | null
  draftMode: boolean
  currentPanel: WorkspacePanel
  isGenerating: boolean
  onPanelChange: (panel: WorkspacePanel) => void
  onBackHome: () => void
  onSelectTurn: (turnId: string) => void
  onSendMessage: (content: string) => void
  onForkTurn: (parentTurnId: string, content: string) => void
}

const panelTabs: { id: WorkspacePanel; label: string }[] = [
  { id: 'map', label: '地图' },
  { id: 'conversation', label: '对话' },
]

export function TurnWorkspace({
  turns,
  activeLeafId,
  draftMode,
  currentPanel,
  isGenerating,
  onPanelChange,
  onBackHome,
  onSelectTurn,
  onSendMessage,
  onForkTurn,
}: TurnWorkspaceProps) {
  const [isMapVisible, setIsMapVisible] = useState(true)
  const [mapRatio, setMapRatio] = useState(0.35)

  const topic =
    turns.find((t) => t.parentId === null)?.userContent ?? '新的对话'

  const toggleMap = () => setIsMapVisible((visible) => !visible)

  return (
    <main className={`workspace-view active-panel-${currentPanel}`}>
      <header className="workspace-topbar">
        <button
          className="back-home-button"
          type="button"
          onClick={onBackHome}
        >
          <PixelIcon name="chevron-left" />
          返回首页
        </button>
        <div className="workspace-topic">
          <span className="eyebrow">ACTIVE CONVERSATION</span>
          <strong>{topic}</strong>
        </div>
        <div
          className="workspace-progress"
          aria-label={`共 ${turns.length} 轮对话`}
        >
          <span />
          {turns.length} 轮对话
        </div>
      </header>

      <div
        className="mobile-panel-tabs"
        role="tablist"
        aria-label="工作区面板"
      >
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

      <SplitPane
        isLeftVisible={isMapVisible}
        ratio={mapRatio}
        onRatioChange={setMapRatio}
        onToggleLeft={toggleMap}
        left={
          <TurnMap
            turns={turns}
            activeLeafId={activeLeafId}
            draftMode={draftMode}
            onSelectTurn={onSelectTurn}
            onHide={toggleMap}
          />
        }
        right={
          <TurnConversation
            turns={turns}
            activeLeafId={activeLeafId}
            draftMode={draftMode}
            isGenerating={isGenerating}
            onSendMessage={onSendMessage}
            onForkTurn={onForkTurn}
          />
        }
      />
    </main>
  )
}
