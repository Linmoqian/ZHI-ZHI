import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { PixelIcon } from './PixelIcon'
import { MarkdownContent } from './MarkdownContent'
import { pathFromRoot } from '../lib/turnTree'
import type { TurnDTO } from '../types'

type TurnConversationProps = {
  turns: TurnDTO[]
  activeLeafId: string | null
  draftMode: boolean
  isGenerating: boolean
  onSendMessage: (content: string) => void
  onForkTurn: (parentTurnId: string, content: string) => void
  /** 待定分叉的父回合 id；非空时输入框进入「新链生长」态。 */
  forkParentId: string | null
  onBeginFork: (parentTurnId: string) => void
  onCancelFork: () => void
}

const quickPrompts = ['换个直觉类比', '给我一个最小例子', '检查我的理解']

export function TurnConversation({
  turns,
  activeLeafId,
  draftMode,
  isGenerating,
  onSendMessage,
  onForkTurn,
  forkParentId,
  onBeginFork,
  onCancelFork,
}: TurnConversationProps) {
  const [draft, setDraft] = useState('')
  const messageEndRef = useRef<HTMLDivElement>(null)

  const visibleTurns = useMemo(
    () => (activeLeafId ? pathFromRoot(turns, activeLeafId) : []),
    [turns, activeLeafId],
  )

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isGenerating, visibleTurns.length])

  const submitDraft = () => {
    const content = draft.trim()
    if (!content || isGenerating) {
      return
    }
    if (forkParentId) {
      // 待定分叉态：提交即从该父回合长出新链
      onForkTurn(forkParentId, content)
    } else {
      onSendMessage(content)
    }
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
      return
    }
    // 待定分叉态：Esc 取消分叉，回到普通持续追问
    if (event.key === 'Escape' && forkParentId) {
      event.preventDefault()
      setDraft('')
      onCancelFork()
    }
  }

  const placeholder = draftMode
    ? '提出你的第一个问题，对话将从这里开始生长…'
    : forkParentId
      ? '新链生长：输入新问题，将从上个回合长出分叉…'
      : '继续追问，或把不懂的地方拆成新的支线…'

  return (
    <section
      className="workspace-panel conversation-panel"
      aria-label="当前对话支线"
    >
      <header className="conversation-header">
        <div className="conversation-node-mark tone-blue">
          <PixelIcon name="branch" />
        </div>
        <div>
          <div className="breadcrumb">
            <span>对话支线</span>
            <b>/</b>
            <span>{draftMode ? '新对话' : `第 ${visibleTurns.length} 轮`}</span>
          </div>
          <h2>{draftMode ? '新的对话' : '正在生长的支线'}</h2>
        </div>
        <span
          className="panel-swap-handle"
          role="button"
          tabIndex={0}
          aria-label="拖拽与地图面板互换位置"
          title="拖拽互换位置"
        >
          <PixelIcon name="exchange" />
        </span>
      </header>

      <div
        className="message-list"
        aria-busy={isGenerating}
        aria-live="polite"
      >
        {draftMode ? (
          <div className="conversation-empty">
            <PixelIcon name="spark" />
            <strong>开始一段新的对话</strong>
            <p>
              提出第一个问题，知枝会回应你；
              之后每一轮对话都会让这棵树长出新的枝叶。
            </p>
          </div>
        ) : visibleTurns.length > 0 ? (
          visibleTurns.map((turn, index) => {
            const isLastTurn = index === visibleTurns.length - 1
            return (
              <div className="message-round" key={turn.id}>
                <article className="message message--user">
                  <span className="message__avatar">你</span>
                  <div className="message__body">
                    <div className="message__meta">
                      <strong>你</strong>
                      <span>{turn.createdAt}</span>
                    </div>
                    <MarkdownContent markdown={turn.userContent} className="message__text" />
                  </div>
                </article>
                <article className="message message--assistant">
                  <span className="message__avatar">
                    <PixelIcon name="branch" />
                  </span>
                  <div className="message__body">
                    <div className="message__meta">
                      <strong>知枝</strong>
                      <span>{turn.createdAt}</span>
                    </div>
                    <MarkdownContent markdown={turn.assistantContent} className="message__text" />
                  </div>
                </article>
                {!isLastTurn ? (
                  <div
                    className="round-divider"
                    aria-label="对话回合分隔线"
                  >
                    <span className="round-divider__rule" />
                    <button
                      type="button"
                      className="round-clone-button"
                      disabled={isGenerating || forkParentId !== null}
                      title="从这一轮分叉出一条新的对话支线"
                      onClick={() => onBeginFork(turn.id)}
                    >
                      <PixelIcon name="branch" />
                      从此处分叉新支线
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
            <strong>选中的支线暂无内容</strong>
            <p>在左侧地图点选一个回合，或继续提问。</p>
          </div>
        )}

        {isGenerating ? (
          <div className="generating-indicator" role="status">
            <span />
            <span />
            <span />
            正在思考回复…
          </div>
        ) : null}
        <div ref={messageEndRef} />
      </div>

      <footer className="composer-area">
        {!draftMode && !forkParentId && (
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
        )}
        {!draftMode && forkParentId && (
          <div className="fork-start-banner">
            <PixelIcon name="branch" />
            <span>正在为新支线生长做准备，输入内容即以新链继续</span>
            <button
              type="button"
              className="fork-cancel-button"
              onClick={() => {
                setDraft('')
                onCancelFork()
              }}
            >
              <PixelIcon name="close" />
              取消分叉
            </button>
          </div>
        )}
        <form className="message-composer" onSubmit={handleSubmit}>
          <textarea
            aria-label={
              draftMode
                ? '提出第一个问题'
                : forkParentId
                  ? '新链生长，输入新问题'
                  : '继续对话'
            }
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <div className="composer-actions">
            <span>
              {forkParentId
                ? '输入内容即成新链 · Esc 取消分叉'
                : 'Enter 发送 · Shift + Enter 换行'}
            </span>
            <button
              className="send-button pixel-press"
              type="submit"
              aria-label={forkParentId ? '从新链生长提交' : '发送消息'}
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
