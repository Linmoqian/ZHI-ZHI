import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import './App.css'
import { HomeView } from './components/HomeView'
import { NavRail } from './components/NavRail'
import {
  createInitialMessages,
  createInitialNodes,
  DEFAULT_TOPIC,
} from './data'
import { emitDebugEvent } from './lib/debugBus'
import {
  learningApi,
  LearningApiError,
} from './services/learningApi'
import type {
  AppView,
  CanvasPosition,
  ContextMode,
  LearningNode,
  Message,
  NodeAction,
  WorkspacePanel,
} from './types'

const WorkspaceView = lazy(() =>
  import('./components/WorkspaceView').then((module) => ({
    default: module.WorkspaceView,
  })),
)

const createLocalId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

function App() {
  const [view, setView] = useState<AppView>('home')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [topic, setTopic] = useState(DEFAULT_TOPIC)
  const [nodes, setNodes] = useState<LearningNode[]>(() =>
    createInitialNodes(DEFAULT_TOPIC),
  )
  const [messages, setMessages] = useState<Message[]>(() =>
    createInitialMessages(DEFAULT_TOPIC),
  )
  const [currentNodeId, setCurrentNodeId] = useState('self-attention')
  const [currentPanel, setCurrentPanel] =
    useState<WorkspacePanel>('conversation')
  const [isSessionStarting, setIsSessionStarting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [toast, setToast] = useState('')

  const currentNode = useMemo(
    () => nodes.find((node) => node.id === currentNodeId) ?? nodes[0],
    [currentNodeId, nodes],
  )

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

  const goHome = useCallback(() => {
    setView('home')
    emitDebugEvent('view:change', { view: 'home' })
  }, [])

  const startLearning = useCallback(
    async (nextTopic: string) => {
      if (isSessionStarting) {
        return
      }
      const normalizedTopic = nextTopic.trim() || DEFAULT_TOPIC
      setIsSessionStarting(true)

      try {
        const { session } = await learningApi.createSession(normalizedTopic)
        const activeNode =
          session.nodes.find((node) => node.status === 'current') ??
          session.nodes[0]

        setSessionId(session.id)
        setTopic(session.topic)
        setNodes(session.nodes)
        setMessages(session.messages)
        setCurrentNodeId(activeNode.id)
        setCurrentPanel('conversation')
        setIsGenerating(false)
        setView('workspace')
        emitDebugEvent('view:change', {
          view: 'workspace',
          source: 'backend-session',
          sessionId: session.id,
          topic: session.topic,
        })
      } catch (error) {
        showApiError(error)
      } finally {
        setIsSessionStarting(false)
      }
    },
    [isSessionStarting, showApiError],
  )

  const goWorkspace = useCallback(() => {
    if (!sessionId) {
      void startLearning(topic)
      return
    }
    setView('workspace')
    setCurrentPanel('conversation')
    emitDebugEvent('view:change', { view: 'workspace', sessionId })
  }, [sessionId, startLearning, topic])

  const selectNode = useCallback((nodeId: string) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === nodeId && node.status === 'exploring') {
          return { ...node, status: 'current' }
        }
        if (node.id !== nodeId && node.status === 'current') {
          return { ...node, status: 'exploring' }
        }
        return node
      }),
    )
    setCurrentNodeId(nodeId)
    setCurrentPanel('conversation')
    emitDebugEvent('node:select', { nodeId })
  }, [])

  const moveNode = useCallback(
    (nodeId: string, position: CanvasPosition) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId ? { ...node, position } : node,
        ),
      )
    },
    [],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      const normalizedContent = content.trim()
      if (
        !normalizedContent ||
        isGenerating ||
        !currentNode ||
        !sessionId
      ) {
        return
      }

      const targetNodeId = currentNode.id
      const optimisticId = createLocalId('message-pending')
      const optimisticMessage: Message = {
        id: optimisticId,
        nodeId: targetNodeId,
        role: 'user',
        content: normalizedContent,
        createdAt: '刚刚',
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        optimisticMessage,
      ])
      setIsGenerating(true)
      emitDebugEvent('message:send', {
        sessionId,
        nodeId: targetNodeId,
        contentLength: normalizedContent.length,
      })

      try {
        const result = await learningApi.sendMessage(
          sessionId,
          targetNodeId,
          normalizedContent,
        )
        setMessages((currentMessages) => [
          ...currentMessages.filter(
            (message) => message.id !== optimisticId,
          ),
          result.userMessage,
          result.assistantMessage,
        ])
        emitDebugEvent('context:compiled', {
          nodeId: targetNodeId,
          ...result.contextTrace,
        })
      } catch (error) {
        setMessages((currentMessages) =>
          currentMessages.filter(
            (message) => message.id !== optimisticId,
          ),
        )
        showApiError(error)
      } finally {
        setIsGenerating(false)
      }
    },
    [currentNode, isGenerating, sessionId, showApiError],
  )

  const createBranch = useCallback(
    async (nodeId: string) => {
      if (!sessionId) {
        showToast('请先创建学习会话')
        return
      }

      try {
        const result = await learningApi.createBranch(
          sessionId,
          nodeId,
          'isolated',
        )
        setNodes((currentNodes) => [
          ...currentNodes.map((node) => {
            if (node.id === result.sourceNode.id) {
              return result.sourceNode
            }
            return node.status === 'current'
              ? { ...node, status: 'exploring' as const }
              : node
          }),
          result.node,
        ])
        setMessages((currentMessages) => [
          ...currentMessages,
          result.message,
        ])
        setCurrentNodeId(result.node.id)
        setCurrentPanel('conversation')
        showToast('隔离分支已创建')
        emitDebugEvent('node:create', {
          nodeId: result.node.id,
          parentId: result.node.parentId,
          contextMode: result.node.contextMode,
        })
      } catch (error) {
        showApiError(error)
      }
    },
    [sessionId, showApiError, showToast],
  )

  const returnToParent = useCallback(
    (nodeId: string) => {
      const sourceNode = nodes.find((node) => node.id === nodeId)
      if (!sourceNode?.parentId) {
        return
      }
      const parentId = sourceNode.parentId

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id === sourceNode.id && node.status === 'current') {
            return { ...node, status: 'exploring' }
          }
          if (node.id === parentId && node.status === 'exploring') {
            return { ...node, status: 'current' }
          }
          return node
        }),
      )
      setCurrentNodeId(parentId)
      setCurrentPanel('conversation')
      showToast('已返回父节点')
      emitDebugEvent('node:select', {
        nodeId: parentId,
        source: 'parent',
      })
    },
    [nodes, showToast],
  )

  const mergeToParent = useCallback(
    async (nodeId: string) => {
      if (!sessionId) {
        showToast('请先创建学习会话')
        return
      }

      try {
        const result = await learningApi.mergeBranch(sessionId, nodeId)
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id === result.sourceNode.id) {
              return result.sourceNode
            }
            if (node.id === result.parentNode.id) {
              return result.parentNode
            }
            return node
          }),
        )
        setMessages((currentMessages) => [
          ...currentMessages,
          result.message,
        ])
        setCurrentNodeId(result.parentNode.id)
        setCurrentPanel('conversation')
        showToast('分支结论已安全合并')
        emitDebugEvent('node:merge', {
          nodeId: result.sourceNode.id,
          parentId: result.parentNode.id,
        })
      } catch (error) {
        showApiError(error)
      }
    },
    [sessionId, showApiError, showToast],
  )

  const markMastered = useCallback(
    async (nodeId: string) => {
      if (!sessionId) {
        showToast('请先创建学习会话')
        return
      }

      try {
        const result = await learningApi.updateNode(sessionId, nodeId, {
          status: 'mastered',
        })
        setNodes((currentNodes) =>
          replaceNode(currentNodes, result.node),
        )
        showToast('已标记为掌握')
        emitDebugEvent('node:update', {
          nodeId,
          status: 'mastered',
        })
      } catch (error) {
        showApiError(error)
      }
    },
    [sessionId, showApiError, showToast],
  )

  const changeContextMode = useCallback(
    async (nodeId: string, mode: ContextMode) => {
      if (!sessionId) {
        showToast('请先创建学习会话')
        return
      }

      try {
        const result = await learningApi.updateNode(sessionId, nodeId, {
          contextMode: mode,
        })
        setNodes((currentNodes) =>
          replaceNode(currentNodes, result.node),
        )
        showToast(
          mode === 'inherit'
            ? '已继承创建时的父节点快照'
            : '已隔离父节点与同级分支',
        )
        emitDebugEvent('node:update', { nodeId, contextMode: mode })
      } catch (error) {
        showApiError(error)
      }
    },
    [sessionId, showApiError, showToast],
  )

  const handleNodeAction = useCallback(
    (nodeId: string, action: NodeAction) => {
      if (action === 'create-branch') {
        void createBranch(nodeId)
      } else if (action === 'merge-parent') {
        void mergeToParent(nodeId)
      } else if (action === 'return-parent') {
        returnToParent(nodeId)
      } else {
        void markMastered(nodeId)
      }
    },
    [createBranch, markMastered, mergeToParent, returnToParent],
  )

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
          isStarting={isSessionStarting}
          onStartLearning={(nextTopic) => {
            void startLearning(nextTopic)
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
          <WorkspaceView
            topic={topic}
            nodes={nodes}
            messages={messages}
            currentNode={currentNode}
            currentPanel={currentPanel}
            isGenerating={isGenerating}
            onPanelChange={setCurrentPanel}
            onBackHome={goHome}
            onSelectNode={selectNode}
            onMoveNode={moveNode}
            onNodeAction={handleNodeAction}
            onSendMessage={(content) => {
              void sendMessage(content)
            }}
            onContextModeChange={(nodeId, mode) => {
              void changeContextMode(nodeId, mode)
            }}
          />
        </Suspense>
      )}
      <div
        className={`app-toast ${toast ? 'is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span><PixelToastIcon /></span>
        {toast}
      </div>
    </div>
  )
}

function replaceNode(nodes: LearningNode[], updatedNode: LearningNode) {
  return nodes.map((node) =>
    node.id === updatedNode.id ? updatedNode : node,
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
