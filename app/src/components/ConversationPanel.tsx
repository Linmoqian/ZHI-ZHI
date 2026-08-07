import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type {
  LearningNode,
  Message,
  NodeAction,
  NodeStatus,
} from '../types'
import { LearningGuide } from './LearningGuide'
import { PixelIcon } from './PixelIcon'

type ConversationPanelProps = {
  node: LearningNode
  nodes: LearningNode[]
  parent: LearningNode | null
  messages: Message[]
  completedNodes: number
  totalNodes: number
  isGuideMinimized: boolean
  isGenerating: boolean
  onGuideToggle: () => void
  onSelectNode: (nodeId: string) => void
  onSendMessage: (content: string) => void
  onNodeAction: (nodeId: string, action: NodeAction) => void
}

const quickPrompts = ['换个直觉类比', '给我一个最小例子', '检查我的理解']

const statusLabels: Record<NodeStatus, string> = {
  current: '正在学习',
  exploring: '探索中',
  mastered: '已掌握',
  merged: '已合并',
  locked: '待解锁',
}

export function ConversationPanel({
  node,
  nodes,
  parent,
  messages,
  completedNodes,
  totalNodes,
  isGuideMinimized,
  isGenerating,
  onGuideToggle,
  onSelectNode,
  onSendMessage,
  onNodeAction,
}: ConversationPanelProps) {
  const [draft, setDraft] = useState('')
  const messageEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isGenerating, messages])

  const submitDraft = () => {
    const content = draft.trim()
    if (!content || isGenerating) {
      return
    }
    onSendMessage(content)
    setDraft('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitDraft()
    }
  }

  return (
    <section
      className={`workspace-panel conversation-panel ${
        isGuideMinimized ? 'has-minimized-guide' : 'has-learning-guide'
      }`}
      aria-label="当前节点对话"
    >
      <header className="conversation-header">
        <div className={`conversation-node-mark tone-${node.tone}`}>
          <PixelIcon name="branch" />
        </div>
        <div>
          <div className="breadcrumb">
            <span>{parent?.title ?? '学习主线'}</span>
            <b>/</b>
            <span>当前节点</span>
          </div>
          <h2>{node.title}</h2>
        </div>
        <span
          className={`conversation-status tone-${node.tone}`}
          aria-label={`节点状态：${statusLabels[node.status]}，${
            node.contextMode === 'inherit' ? '继承父节点上下文' : '独立上下文'
          }`}
        >
          <i />
          {statusLabels[node.status]} ·
          {node.contextMode === 'inherit' ? ' 继承上下文' : ' 独立上下文'}
        </span>
      </header>

      <LearningGuide
        node={node}
        nodes={nodes}
        parent={parent}
        completedNodes={completedNodes}
        totalNodes={totalNodes}
        minimized={isGuideMinimized}
        onToggleMinimized={onGuideToggle}
        onNodeAction={onNodeAction}
        onSelectNode={onSelectNode}
      />

      <div
        className="message-list"
        aria-busy={isGenerating}
        aria-live="polite"
      >
        <div className="topic-context">
          <PixelIcon name="spark" />
          <div>
            <strong>本节点学习目标</strong>
            <p>{node.summary}</p>
          </div>
        </div>

        {messages.length > 0 ? (
          messages.map((message, messageIndex) => {
            const isRoundEnd = message.role === 'assistant' && messageIndex < messages.length - 1
            return (
              <div className="message-round" key={message.id}>
                <article
                  className={`message message--${message.role}`}
                >
                  <span className="message__avatar">
                    {message.role === 'assistant' ? (
                      <PixelIcon name="branch" />
                    ) : (
                      '你'
                    )}
                  </span>
                  <div className="message__body">
                    <div className="message__meta">
                      <strong>{message.role === 'assistant' ? '知枝' : '你'}</strong>
                      <span>{message.createdAt}</span>
                    </div>
                    <p>{message.content}</p>
                  </div>
                </article>
                {isRoundEnd ? (
                  <div className="round-divider" aria-label="对话回合分隔线">
                    <span className="round-divider__rule" />
                    <button
                      type="button"
                      className="round-clone-button"
                      disabled={isGenerating}
                      title="从这里克隆出一条新分支继续深入"
                      onClick={() => onNodeAction(node.id, 'clone-branch')}
                    >
                      <PixelIcon name="branch" />
                      克隆此分支继续深入
                    </button>
                    <span className="round-divider__rule" />
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className="conversation-empty">
            <PixelIcon name="book" />
            <strong>这是一个新的学习分支</strong>
            <p>从第一个问题开始，答案会只在这个节点内生长。</p>
          </div>
        )}

        {isGenerating ? (
          <div className="generating-indicator" role="status">
            <span />
            <span />
            <span />
            正在整理这条分支…
          </div>
        ) : null}
        <div ref={messageEndRef} />
      </div>

      <footer className="composer-area">
        <div className="quick-prompts" aria-label="快捷提问">
          {quickPrompts.map((prompt) => (
            <button
              type="button"
              key={prompt}
              disabled={isGenerating}
              onClick={() => onSendMessage(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        <form className="message-composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="向当前节点提问"
            placeholder="继续追问，或把不懂的地方拆成新分支…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <div className="composer-actions">
            <span>Enter 发送 · Shift + Enter 换行</span>
            <button
              className="send-button pixel-press"
              type="submit"
              aria-label="发送消息"
              disabled={!draft.trim() || isGenerating}
            >
              <PixelIcon name="send" />
            </button>
          </div>
        </form>
      </footer>
    </section>
  )
}
