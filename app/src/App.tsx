import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import './App.css'
import { HomeView } from './components/HomeView'
import { NavRail } from './components/NavRail'
import { emitDebugEvent } from './lib/debugBus'
import {
  clearLastSessionId,
  loadLastSessionId,
  saveLastSessionId,
} from './lib/lastSession'
import { turnApi } from './services/turnApi'
import { LearningApiError } from './services/apiError'
import type {
  AppView,
  TurnDTO,
  TurnSessionSummary,
  WorkspacePanel,
} from './types'

const TurnWorkspace = lazy(() =>
  import('./components/TurnWorkspace').then((module) => ({
    default: module.TurnWorkspace,
  })),
)

function App() {
  const [view, setView] = useState<AppView>('home')
  // 草稿模式：已进入工作区但尚未创建会话；用户首次输入时才建会话。
  const [draftMode, setDraftMode] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<TurnDTO[]>([])
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null)
  const [currentPanel, setCurrentPanel] =
    useState<WorkspacePanel>('conversation')
  const [isGenerating, setIsGenerating] = useState(false)
  const [recentSessions, setRecentSessions] = useState<
    TurnSessionSummary[]
  >([])
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showToast = useCallback((content: string) => {
    setToast(content)
  }, [])

  const showApiError = useCallback(
    (error: unknown) => {
      showToast(
        error instanceof LearningApiError
          ? error.message
          : '操作失败，请稍后重试',
      )
    },
    [showToast],
  )

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await turnApi.listSessions()
      setRecentSessions(sessions)
    } catch {
      setRecentSessions([])
    }
  }, [])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  const goHome = useCallback(() => {
    setView('home')
    setDraftMode(false)
    emitDebugEvent('view:change', { view: 'home' })
  }, [])

  /** 点击首页加号：进入空白工作区（草稿模式），不创建会话。 */
  const startNewConversation = useCallback(() => {
    setSessionId(null)
    setTurns([])
    setActiveLeafId(null)
    setDraftMode(true)
    setCurrentPanel('conversation')
    setIsGenerating(false)
    setView('workspace')
    emitDebugEvent('view:change', { view: 'workspace', source: 'draft' })
  }, [])

  /** 恢复已有会话：加载完整回合树，定位到最深叶回合。 */
  const resumeSession = useCallback(
    async (sessionIdToResume: string) => {
      setView('workspace')
      try {
        const { session } = await turnApi.getSession(sessionIdToResume)
        setSessionId(session.id)
        setTurns(session.turns)
        // 默认定位到创建时间最新的叶回合
        const leaf = [...session.turns]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        setActiveLeafId(leaf?.id ?? null)
        setDraftMode(false)
        setCurrentPanel('conversation')
        setIsGenerating(false)
        saveLastSessionId(session.id)
        emitDebugEvent('view:change', {
          view: 'workspace',
          source: 'resume',
          sessionId: session.id,
        })
      } catch (error) {
        setView('home')
        // 会话可能已被删除，清除过期记录
        clearLastSessionId()
        showApiError(error)
      }
    },
    [showApiError],
  )

  // 应用启动时恢复上次打开的会话；若无记录则留在首页。
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) {
      return
    }
    hasRestoredRef.current = true
    const lastId = loadLastSessionId()
    if (lastId) {
      void resumeSession(lastId)
    }
  }, [resumeSession])

  const goWorkspace = useCallback(() => {
    // 优先恢复上次会话；无记录才进入空白草稿。
    if (!sessionId && !draftMode) {
      const lastId = loadLastSessionId()
      if (lastId) {
        void resumeSession(lastId)
        return
      }
      startNewConversation()
      return
    }
    setView('workspace')
    setCurrentPanel('conversation')
  }, [sessionId, draftMode, startNewConversation, resumeSession])

  /**
   * 发送消息：
   * - 草稿模式（无会话）：首次输入创建根回合
   * - 已有会话：在当前活跃叶回合后追加子回合（生长）
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const normalized = content.trim()
      if (!normalized || isGenerating) {
        return
      }

      setIsGenerating(true)
      emitDebugEvent('message:send', {
        sessionId,
        contentLength: normalized.length,
      })

      try {
        if (draftMode || !sessionId) {
          // 首次输入：创建会话（根回合）
          const { session } = await turnApi.createSession(normalized)
          setSessionId(session.id)
          setTurns(session.turns)
          const root = session.turns[0]
          setActiveLeafId(root.id)
          setDraftMode(false)
          saveLastSessionId(session.id)
          emitDebugEvent('turn:create', {
            sessionId: session.id,
            turnId: root.id,
          })
        } else if (activeLeafId) {
          // 后续输入：追加回合
          const { turn } = await turnApi.appendTurn(
            sessionId,
            activeLeafId,
            normalized,
          )
          setTurns((current) => [...current, turn])
          setActiveLeafId(turn.id)
          emitDebugEvent('turn:append', {
            sessionId,
            turnId: turn.id,
            parentId: activeLeafId,
          })
        }
        void refreshSessions()
      } catch (error) {
        showApiError(error)
      } finally {
        setIsGenerating(false)
      }
    },
    [
      activeLeafId,
      draftMode,
      isGenerating,
      refreshSessions,
      sessionId,
      showApiError,
    ],
  )

  /** 从指定回合分叉出新子回合（成为兄弟）。 */
  const forkTurn = useCallback(
    async (parentTurnId: string, content: string) => {
      const normalized = content.trim()
      if (!normalized || !sessionId || isGenerating) {
        return
      }
      setIsGenerating(true)
      try {
        const { turn } = await turnApi.forkTurn(
          sessionId,
          parentTurnId,
          normalized,
        )
        setTurns((current) => [...current, turn])
        setActiveLeafId(turn.id)
        showToast('已分叉出新的对话支线')
        emitDebugEvent('turn:fork', {
          sessionId,
          turnId: turn.id,
          parentId: parentTurnId,
        })
        void refreshSessions()
      } catch (error) {
        showApiError(error)
      } finally {
        setIsGenerating(false)
      }
    },
    [isGenerating, refreshSessions, sessionId, showApiError, showToast],
  )

  /** 选中某个回合：切换活跃叶（切换可见的对话支线）。 */
  const selectTurn = useCallback((turnId: string) => {
    setActiveLeafId(turnId)
    setCurrentPanel('conversation')
    emitDebugEvent('turn:select', { turnId })
  }, [])

  return (
    <div className={`app-shell view-${view}`}>
      <NavRail
        view={view}
        onHome={goHome}
        onWorkspace={goWorkspace}
        onShowSoon={(feature) => showToast(`${feature}将在后续版本开放`)}
      />
      {view === 'home' ? (
        <HomeView
          recentSessions={recentSessions}
          onNewConversation={startNewConversation}
          onContinueSession={(id) => {
            void resumeSession(id)
          }}
        />
      ) : (
        <Suspense
          fallback={
            <main className="workspace-loading" role="status">
              <span />
              <strong>正在展开知识地图…</strong>
            </main>
          }
        >
          <TurnWorkspace
            turns={turns}
            activeLeafId={activeLeafId}
            draftMode={draftMode}
            currentPanel={currentPanel}
            isGenerating={isGenerating}
            onPanelChange={setCurrentPanel}
            onBackHome={goHome}
            onSelectTurn={selectTurn}
            onSendMessage={(content) => {
              void sendMessage(content)
            }}
            onForkTurn={(turnId, content) => {
              void forkTurn(turnId, content)
            }}
          />
        </Suspense>
      )}
      <div
        className={`app-toast ${toast ? 'is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span>
          <PixelToastIcon />
        </span>
        {toast}
      </div>
    </div>
  )
}

function PixelToastIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

export default App
