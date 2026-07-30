import { useState, type FormEvent } from 'react'
import { RECENT_PROJECTS } from '../data'
import type { NodeTone, RecentProject } from '../types'
import { PixelIcon } from './PixelIcon'

type HomeViewProps = {
  onStartLearning: (topic: string) => void
}

const toneSteps: NodeTone[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'blue',
]

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

function ProjectPreview({ tone }: { tone: RecentProject['tone'] }) {
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

function RecentProjectCard({
  project,
  onContinue,
}: {
  project: RecentProject
  onContinue: () => void
}) {
  return (
    <article className={`recent-card tone-${project.tone}`}>
      <div className="recent-card__heading">
        <span className="icon-cube">
          <PixelIcon name={project.icon} />
        </span>
        <div>
          <span>{project.category}</span>
          <h3>{project.title}</h3>
        </div>
      </div>

      <ProjectPreview tone={project.tone} />

      <div className="recent-card__footer">
        <div
          className="pixel-progress"
          aria-label={`学习进度 ${project.progress}/9`}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <i className={index < project.progress ? 'is-filled' : ''} key={index} />
          ))}
        </div>
        <button className="continue-button pixel-press" type="button" onClick={onContinue}>
          继续
          <PixelIcon name="arrow" />
        </button>
      </div>
    </article>
  )
}

export function HomeView({ onStartLearning }: HomeViewProps) {
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

        <form className="learning-prompt pixel-panel" onSubmit={handleSubmit}>
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
          />
          <button
            className="learning-prompt__submit pixel-press"
            type="submit"
            aria-label="开始学习"
            disabled={!topic.trim()}
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
            <span>3 条正在生长的知识路径</span>
          </div>

          <div className="recent-grid">
            {RECENT_PROJECTS.map((project) => (
              <RecentProjectCard
                key={project.id}
                project={project}
                onContinue={() => onStartLearning(project.title)}
              />
            ))}
          </div>
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
