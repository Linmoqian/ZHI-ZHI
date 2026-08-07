import { motion } from 'motion/react'
import type { PixelIconName, TurnSessionSummary } from '../types'
import { PixelIcon } from './PixelIcon'

type HomeViewProps = {
  onNewConversation: () => void
  recentSessions: TurnSessionSummary[]
  onContinueSession: (sessionId: string) => void
}

const cardTones = ['blue', 'green', 'purple', 'orange'] as const
const cardIcons: PixelIconName[] = ['brain', 'leaf', 'atom', 'compass']

type CardMeta = {
  tone: (typeof cardTones)[number]
  icon: PixelIconName
}

const metaForIndex = (index: number): CardMeta => ({
  tone: cardTones[index % cardTones.length],
  icon: cardIcons[index % cardIcons.length],
})

function TopicIllustration() {
  return (
    <div className="topic-illustration" aria-hidden="true">
      <div className="topic-note">
        <span />
        <span />
        <span />
      </div>
      <svg viewBox="0 0 260 116">
        <path d="M116 56H156V26H184" />
        <path d="M156 56v34h28" />
        <path d="M156 56h66" />
      </svg>
      <i className="voxel-block voxel-block--blue voxel-block--one" />
      <i className="voxel-block voxel-block--green voxel-block--two" />
      <i className="voxel-block voxel-block--orange voxel-block--three" />
    </div>
  )
}

function ConversationPreview({
  tone,
}: {
  tone: (typeof cardTones)[number]
}) {
  return (
    <div className={`project-preview tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 240 112">
        <path d="M40 56h60V25h42" />
        <path d="M100 56h55" />
        <path d="M100 56v34h42" />
      </svg>
      <i className="preview-node preview-node--hub" />
      <i className="preview-node preview-node--a" />
      <i className="preview-node preview-node--b" />
      <i className="preview-node preview-node--c" />
    </div>
  )
}

function RecentSessionCard({
  session,
  meta,
  onContinue,
}: {
  session: TurnSessionSummary
  meta: CardMeta
  onContinue: () => void
}) {
  return (
    <motion.article
      className={`recent-card tone-${meta.tone}`}
      whileHover={{ transform: 'translateY(-6px)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      <div className="recent-card__heading">
        <motion.span
          className="icon-cube"
          whileHover={{ transform: 'rotate(-8deg) scale(1.08)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <PixelIcon name={meta.icon} />
        </motion.span>
        <div>
          <span>对话路径</span>
          <h3>{session.topic}</h3>
        </div>
      </div>

      <ConversationPreview tone={meta.tone} />

      <div className="recent-card__footer">
        <span className="recent-card__count">
          {session.turnCount} 轮对话
        </span>
        <button
          className="continue-button pixel-press"
          type="button"
          onClick={onContinue}
        >
          继续
          <PixelIcon name="arrow" />
        </button>
      </div>
    </motion.article>
  )
}

export function HomeView({
  onNewConversation,
  recentSessions,
  onContinueSession,
}: HomeViewProps) {
  return (
    <main className="home-view">
      <div className="home-view__content">
        <header className="home-header">
          <div>
            <span className="eyebrow">ZHI · ZHI LEARNING SPACE</span>
            <h1>
              让每一个不懂，
              <br />
              长成一条可以回来的分支。
            </h1>
          </div>
          <TopicIllustration />
        </header>

        <button
          type="button"
          className="learning-prompt pixel-panel new-conversation-button pixel-press"
          onClick={onNewConversation}
          aria-label="新建对话"
        >
          <span className="learning-prompt__icon">
            <PixelIcon name="plus" />
          </span>
          <span className="new-conversation-button__label">
            <strong>新建对话</strong>
            <small>从一个问题出发，让知识随对话生长</small>
          </span>
          <span className="learning-prompt__submit">
            <PixelIcon name="arrow" />
          </span>
        </button>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CONTINUE EXPLORING</span>
              <h2 id="recent-title">最近学习</h2>
            </div>
            <span>
              {recentSessions.length} 条正在生长的对话路径
            </span>
          </div>

          {recentSessions.length > 0 ? (
            <div className="recent-grid">
              {recentSessions.map((session, index) => (
                <RecentSessionCard
                  key={session.id}
                  session={session}
                  meta={metaForIndex(index)}
                  onContinue={() => onContinueSession(session.id)}
                />
              ))}
            </div>
          ) : (
            <div className="recent-empty">
              还没有对话，点击上方「新建对话」开始你的第一次提问。
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
