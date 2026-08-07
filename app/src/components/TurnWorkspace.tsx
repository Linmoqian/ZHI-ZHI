import { useState } from 'react'
import type { TurnDTO, WorkspacePanel } from '../types'
import { PixelIcon } from './PixelIcon'
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

  const topic =
    turns.find((t) => t.parentId === null)?.userContent ?? '新的对话'

  return (
    <main className="workspace-view">
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

      <div
        className={`workspace-grid active-panel-${currentPanel} ${
          isMapVisible ? '' : 'is-map-hidden'
        }`}
      >
        <TurnMap
          turns={turns}
          activeLeafId={activeLeafId}
          draftMode={draftMode}
          onSelectTurn={onSelectTurn}
          onHide={() => setIsMapVisible(false)}
        />
        {!isMapVisible ? (
          <button
            className="map-reveal-tab"
            type="button"
            aria-label="显示对话地图"
            title="显示对话地图"
            onClick={() => setIsMapVisible(true)}
          >
            <PixelIcon name="map" />
            <span>显示地图</span>
          </button>
        ) : null}
        <TurnConversation
          turns={turns}
          activeLeafId={activeLeafId}
          draftMode={draftMode}
          isGenerating={isGenerating}
          onSendMessage={onSendMessage}
          onForkTurn={onForkTurn}
        />
      </div>
    </main>
  )
}
