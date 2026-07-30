import type { LearningNode, NodeAction, NodeStatus } from '../types'
import { LearningPathOverview } from './LearningPathOverview'
import { PixelIcon } from './PixelIcon'

type LearningGuideProps = {
  node: LearningNode
  nodes: LearningNode[]
  parent: LearningNode | null
  completedNodes: number
  totalNodes: number
  minimized: boolean
  onToggleMinimized: () => void
  onNodeAction: (nodeId: string, action: NodeAction) => void
  onSelectNode: (nodeId: string) => void
}

const statusLabels: Record<NodeStatus, string> = {
  current: '正在学习',
  exploring: '探索中',
  mastered: '已掌握',
  merged: '已合并',
  locked: '待解锁',
}

export function LearningGuide({
  node,
  nodes,
  parent,
  completedNodes,
  totalNodes,
  minimized,
  onToggleMinimized,
  onNodeAction,
  onSelectNode,
}: LearningGuideProps) {
  const isLocked = node.status === 'locked'
  const isCompleted =
    node.status === 'mastered' || node.status === 'merged'
  const segmentCount = Math.min(totalNodes, 8)
  const completedSegments =
    totalNodes === 0
      ? 0
      : Math.round((completedNodes / totalNodes) * segmentCount)

  if (minimized) {
    return (
      <aside
        className={`learning-guide learning-guide--minimized tone-${node.tone}`}
        aria-label="学习引导已最小化"
      >
        <button
          className="learning-guide__restore"
          type="button"
          aria-label="展开学习引导"
          onClick={onToggleMinimized}
        >
          <span className="learning-guide__mark">
            <PixelIcon name="branch" />
          </span>
          <span>
            <small>LEARNING GUIDE</small>
            <strong>{node.title}</strong>
          </span>
          <b aria-hidden="true">＋</b>
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={`learning-guide tone-${node.tone}`}
      aria-label="当前节点学习引导"
    >
      <header className="learning-guide__header">
        <span className="learning-guide__mark">
          <PixelIcon name="branch" />
        </span>
        <div>
          <span className="eyebrow">LEARNING GUIDE</span>
          <strong>学习引导</strong>
        </div>
        <button
          className="learning-guide__minimize"
          type="button"
          aria-label="最小化学习引导"
          title="最小化学习引导"
          onClick={onToggleMinimized}
        >
          −
        </button>
      </header>

      <div className="learning-guide__body">
        <div className="learning-guide__node">
          <span>{statusLabels[node.status]}</span>
          <h3>{node.title}</h3>
          <p>{node.summary}</p>
        </div>

        <div className="learning-guide__rule" />

        <section className="learning-guide__progress" aria-label="学习进度">
          <div>
            <span className="learning-guide__check">
              <PixelIcon name={isCompleted ? 'check' : 'spark'} />
            </span>
            <strong>{completedNodes}/{totalNodes} 已完成</strong>
          </div>
          <div
            className="learning-guide__segments"
            aria-hidden="true"
          >
            {Array.from({ length: segmentCount }, (_, index) => (
              <i
                className={index < completedSegments ? 'is-filled' : ''}
                key={index}
              />
            ))}
          </div>
        </section>

        <dl className="learning-guide__facts">
          <div>
            <dt>来自</dt>
            <dd>{parent?.title ?? '学习主线'}</dd>
          </div>
          <div>
            <dt>上下文</dt>
            <dd>
              {node.contextMode === 'inherit'
                ? '继承父节点'
                : '独立探索'}
            </dd>
          </div>
        </dl>

        <section className="learning-guide__overview-section">
          <div>
            <strong>路径关系</strong>
            <span>按父子关系自动排列</span>
          </div>
          <LearningPathOverview
            className="learning-guide__overview"
            nodes={nodes}
            currentNodeId={node.id}
            onSelectNode={onSelectNode}
          />
        </section>
      </div>

      <footer className="learning-guide__actions">
        <button
          className="learning-guide__primary pixel-press"
          type="button"
          disabled={isLocked}
          onClick={() =>
            onNodeAction(
              node.id,
              isCompleted ? 'create-branch' : 'mark-mastered',
            )
          }
        >
          <PixelIcon name={isCompleted ? 'plus' : 'check'} />
          {isCompleted ? '继续创建分支' : '标记已掌握'}
        </button>
        <button
          className="learning-guide__secondary pixel-press"
          type="button"
          disabled={isLocked}
          aria-label="创建概念分支"
          onClick={() => onNodeAction(node.id, 'create-branch')}
        >
          <PixelIcon name="branch" />
        </button>
      </footer>
    </aside>
  )
}
