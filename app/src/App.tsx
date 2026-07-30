import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import type {
  AppView,
  CanvasPosition,
  ContextMode,
  LearningNode,
  Message,
  NodeTone,
  WorkspacePanel,
} from './types'

const branchTones: NodeTone[] = ['purple', 'orange', 'green', 'blue']

const WorkspaceView = lazy(() =>
  import('./components/WorkspaceView').then((module) => ({
    default: module.WorkspaceView,
  })),
)

const createLocalId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const createMockResponse = (prompt: string, nodeTitle: string) => {
  if (prompt.includes('例子')) {
    return `用一个最小例子理解「${nodeTitle}」：先只保留两个对象，观察其中一个对象如何根据当前目标，从另一个对象取回有用信息。对象变多时，规则不变，只是关联数量增加了。`
  }

  if (prompt.includes('检查')) {
    return `试着用一句自己的话回答：在「${nodeTitle}」里，输入、关联依据和最终得到的信息分别是什么？如果能清楚区分这三件事，就已经抓住了主干。`
  }

  if (prompt.includes('类比')) {
    return `可以把「${nodeTitle}」想成在书架前带着问题找资料：问题决定你先看哪些书，书的标签帮助判断相关性，真正带走的是书里的内容。`
  }

  return `你问到了「${nodeTitle}」里的关键连接。可以先把问题拆成“它解决什么”“它如何工作”“怎样验证”三步。针对“${prompt}”，建议先从第一步确认目标，再进入结构细节。`
}

function App() {
  const [view, setView] = useState<AppView>('home')
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [toast, setToast] = useState('')
  const responseTimerRef = useRef<number | null>(null)

  const currentNode = useMemo(
    () => nodes.find((node) => node.id === currentNodeId) ?? nodes[0],
    [currentNodeId, nodes],
  )

  useEffect(
    () => () => {
      if (responseTimerRef.current !== null) {
        window.clearTimeout(responseTimerRef.current)
      }
    },
    [],
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

  const goHome = useCallback(() => {
    setView('home')
    emitDebugEvent('view:change', { view: 'home' })
  }, [])

  const goWorkspace = useCallback(() => {
    setView('workspace')
    setCurrentPanel('conversation')
    emitDebugEvent('view:change', { view: 'workspace' })
  }, [])

  const startLearning = useCallback((nextTopic: string) => {
    const normalizedTopic = nextTopic.trim() || DEFAULT_TOPIC
    if (responseTimerRef.current !== null) {
      window.clearTimeout(responseTimerRef.current)
      responseTimerRef.current = null
    }

    setTopic(normalizedTopic)
    setNodes(createInitialNodes(normalizedTopic))
    setMessages(createInitialMessages(normalizedTopic))
    setCurrentNodeId('self-attention')
    setCurrentPanel('conversation')
    setIsGenerating(false)
    setView('workspace')
    emitDebugEvent('view:change', {
      view: 'workspace',
      source: 'start-learning',
      topic: normalizedTopic,
    })
  }, [])

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
    (content: string) => {
      const normalizedContent = content.trim()
      if (!normalizedContent || isGenerating || !currentNode) {
        return
      }

      const targetNodeId = currentNode.id
      const targetNodeTitle = currentNode.title
      const userMessage: Message = {
        id: createLocalId('message-user'),
        nodeId: targetNodeId,
        role: 'user',
        content: normalizedContent,
        createdAt: '刚刚',
      }

      setMessages((currentMessages) => [...currentMessages, userMessage])
      setIsGenerating(true)
      emitDebugEvent('message:send', {
        nodeId: targetNodeId,
        contentLength: normalizedContent.length,
      })

      responseTimerRef.current = window.setTimeout(() => {
        const assistantMessage: Message = {
          id: createLocalId('message-assistant'),
          nodeId: targetNodeId,
          role: 'assistant',
          content: createMockResponse(normalizedContent, targetNodeTitle),
          createdAt: '刚刚',
        }
        setMessages((currentMessages) => [
          ...currentMessages,
          assistantMessage,
        ])
        setIsGenerating(false)
        responseTimerRef.current = null
      }, 760)
    },
    [currentNode, isGenerating],
  )

  const createBranch = useCallback(() => {
    if (!currentNode || currentNode.status === 'locked') {
      return
    }

    const siblings = nodes.filter(
      (node) => node.parentId === currentNode.id,
    ).length
    const branchNumber = siblings + 1
    const branchId = createLocalId('branch')
    const horizontalDirection = siblings % 2 === 0 ? -1 : 1
    const tone = branchTones[siblings % branchTones.length]
    const nextNode: LearningNode = {
      id: branchId,
      parentId: currentNode.id,
      title: `新概念分支 ${branchNumber}`,
      summary: `从“${currentNode.title}”独立探索的新问题。`,
      status: 'current',
      tone,
      position: {
        x: currentNode.position.x + horizontalDirection * (136 + siblings * 20),
        y: currentNode.position.y + 172,
      },
      contextMode: 'inherit',
    }

    setNodes((currentNodes) => [
      ...currentNodes.map((node) =>
        node.id === currentNode.id && node.status === 'current'
          ? { ...node, status: 'exploring' as const }
          : node,
      ),
      nextNode,
    ])
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: createLocalId('message-branch'),
        nodeId: branchId,
        role: 'assistant',
        content:
          '新分支已经创建。这里的追问会保持独立，探索完成后可以把结论合并回父节点。',
        createdAt: '刚刚',
      },
    ])
    setCurrentNodeId(branchId)
    setCurrentPanel('conversation')
    showToast('新概念分支已创建')
    emitDebugEvent('node:create', {
      nodeId: branchId,
      parentId: currentNode.id,
    })
  }, [currentNode, nodes, showToast])

  const returnToParent = useCallback(() => {
    if (!currentNode?.parentId) {
      return
    }
    const parentId = currentNode.parentId
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === currentNode.id && node.status === 'current') {
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
    emitDebugEvent('node:select', { nodeId: parentId, source: 'parent' })
  }, [currentNode, showToast])

  const mergeToParent = useCallback(() => {
    if (!currentNode?.parentId || currentNode.status === 'locked') {
      return
    }

    const parentId = currentNode.parentId
    const childTitle = currentNode.title
    const childSummary = currentNode.summary
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === currentNode.id) {
          return { ...node, status: 'merged' }
        }
        if (node.id === parentId && node.status === 'exploring') {
          return { ...node, status: 'current' }
        }
        return node
      }),
    )
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: createLocalId('message-merge'),
        nodeId: parentId,
        role: 'assistant',
        content: `已合并来自“${childTitle}”的结论：${childSummary}`,
        createdAt: '刚刚',
      },
    ])
    setCurrentNodeId(parentId)
    setCurrentPanel('conversation')
    showToast('分支结论已合并到父节点')
    emitDebugEvent('node:merge', {
      nodeId: currentNode.id,
      parentId,
    })
  }, [currentNode, showToast])

  const markMastered = useCallback(() => {
    if (!currentNode || currentNode.status === 'locked') {
      return
    }
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === currentNode.id ? { ...node, status: 'mastered' } : node,
      ),
    )
    showToast('已标记为掌握')
    emitDebugEvent('node:update', {
      nodeId: currentNode.id,
      status: 'mastered',
    })
  }, [currentNode, showToast])

  const changeContextMode = useCallback(
    (mode: ContextMode) => {
      if (!currentNode) {
        return
      }
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === currentNode.id ? { ...node, contextMode: mode } : node,
        ),
      )
      showToast(mode === 'inherit' ? '已继承父节点上下文' : '已隔离同级分支')
      emitDebugEvent('node:update', {
        nodeId: currentNode.id,
        contextMode: mode,
      })
    },
    [currentNode, showToast],
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
        <HomeView onStartLearning={startLearning} />
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
            onSendMessage={sendMessage}
            onCreateBranch={createBranch}
            onReturnToParent={returnToParent}
            onMerge={mergeToParent}
            onMarkMastered={markMastered}
            onContextModeChange={changeContextMode}
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

function PixelToastIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

export default App
