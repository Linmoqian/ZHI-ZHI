import { useState, type FormEvent } from 'react'
import type { NodeTone, PixelIconName, SessionSummary } from '../types'
import { PixelIcon } from './PixelIcon'

type HomeViewProps = {
  onStartLearning: (topic: string) => void
  isStarting: boolean
  recentSessions: SessionSummary[]
  onContinueSession: (sessionId: string) => void
}

const toneSteps: NodeTone[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'blue',
]

const cardTones: NodeTone[] = ['blue', 'green', 'purple']
const cardIcons: PixelIconName[] = ['brain', 'leaf', 'atom']

type CardMeta = {
  tone: NodeTone
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

function ProjectPreview({ tone }: { tone: NodeTone }) {
  return (
    <div className={`project-preview tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 240 112">
        <path d="M70 55h60V25h42" />
        <path d="M130 55h55" />
        <path d="M130 55v34h42" />
      </svg>
      <i className="preview-node preview-node--hub" />
      <i className="preview-node preview-node--a" />
      <i className="preview-node preview-node--b" />
      <i className="preview-node preview-node--c" />
    </div>
  )
}

const PROGRESS_SEGMENTS = 9

function RecentSessionCard({
  session,
  meta,
  onContinue,
}: {
  session: SessionSummary
  meta: CardMeta
  onContinue: () => void
}) {
  // 用真实完成节点占节点总数的比例，映射到固定段数的进度条。
  const filledSegments =
    session.nodeCount > 0
      ? Math.round(
          (session.completedNodes / session.nodeCount) * PROGRESS_SEGMENTS,
        )
      : 0

  return (
    <article className={`recent-card tone-${meta.tone}`}>
      <div className="recent-card__heading">
        <span className="icon-cube">
          <PixelIcon name={meta.icon} />
        </span>
        <div>
          <span>学习路径</span>
          <h3>{session.topic}</h3>
        </div>
      </div>

      <ProjectPreview tone={meta.tone} />

      <div className="recent-card__footer">
        <div
          className="pixel-progress"
          aria-label={`学习进度 ${session.completedNodes}/${session.nodeCount}`}
        >
          {Array.from({ length: PROGRESS_SEGMENTS }, (_, index) => (
            <i
              className={index < filledSegments ? 'is-filled' : ''}
              key={index}
            />
          ))}
        </div>
        <button
          className="continue-button pixel-press"
          type="button"
          onClick={onContinue}
        >
          继续
          <PixelIcon name="arrow" />
        </button>
      </div>
    </article>
  )
}

export function HomeView({
  onStartLearning,
  isStarting,
  recentSessions,
  onContinueSession,
}: HomeViewProps) {
  const [topic, setTopic] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedTopic = topic.trim()
    if (normalizedTopic) {
      onStartLearning(normalizedTopic)
    }
  }

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

        <form
          className="learning-prompt pixel-panel"
          aria-busy={isStarting}
          onSubmit={handleSubmit}
        >
          <span className="learning-prompt__icon">
            <PixelIcon name="plus" />
          </span>
          <label htmlFor="learning-topic">今天想学什么？</label>
          <input
            id="learning-topic"
            data-testid="learning-input"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="输入一个问题或概念…"
            autoComplete="off"
            disabled={isStarting}
          />
          <button
            className="learning-prompt__submit pixel-press"
            type="submit"
            aria-label={isStarting ? '正在创建学习空间' : '开始学习'}
            disabled={!topic.trim() || isStarting}
          >
            <PixelIcon name="arrow" />
          </button>
        </form>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CONTINUE EXPLORING</span>
              <h2 id="recent-title">最近学习</h2>
            </div>
            <span>{recentSessions.length} 条正在生长的知识路径</span>
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
              还没有学习会话，从上面的输入框开始你的第一课。
            </div>
          )}
        </section>

        <button
          className="explore-strip pixel-panel"
          type="button"
          onClick={() => onStartLearning('沿着好奇心，探索一个新的知识分支')}
        >
          <span className="explore-strip__lead">
            <span className="icon-cube tone-orange">
              <PixelIcon name="compass" />
            </span>
            <span>
              <strong>探索分支</strong>
              <small>从一个问题出发，让知识自由生长</small>
            </span>
          </span>
          <span className="explore-path" aria-hidden="true">
            {toneSteps.map((tone, index) => (
              <i className={`tone-${tone}`} key={`${tone}-${index}`} />
            ))}
          </span>
          <PixelIcon name="arrow" />
        </button>
      </div>
    </main>
  )
}
