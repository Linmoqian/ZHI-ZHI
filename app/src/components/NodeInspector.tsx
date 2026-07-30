import type { ContextMode, LearningNode, NodeStatus } from '../types'
import { PixelIcon } from './PixelIcon'

type NodeInspectorProps = {
  node: LearningNode
  parent: LearningNode | null
  childCount: number
  onCreateBranch: () => void
  onReturnToParent: () => void
  onMerge: () => void
  onMarkMastered: () => void
  onContextModeChange: (mode: ContextMode) => void
}

const statusLabels: Record<NodeStatus, string> = {
  current: '正在学习',
  exploring: '探索中',
  mastered: '已掌握',
  merged: '已合并',
  locked: '待解锁',
}

export function NodeInspector({
  node,
  parent,
  childCount,
  onCreateBranch,
  onReturnToParent,
  onMerge,
  onMarkMastered,
  onContextModeChange,
}: NodeInspectorProps) {
  const isLocked = node.status === 'locked'
  const canUseParent = Boolean(parent) && !isLocked

  return (
    <aside className="workspace-panel inspector-panel" aria-label="节点控制">
      <header className="panel-header">
        <div>
          <span className="eyebrow">NODE CONTROL</span>
          <h2>当前节点</h2>
        </div>
        <button className="icon-only-button" type="button" aria-label="更多节点选项">
          <PixelIcon name="more" />
        </button>
      </header>

      <section className={`node-summary-card tone-${node.tone}`}>
        <span className="node-summary-card__icon">
          <PixelIcon name={isLocked ? 'lock' : 'branch'} />
        </span>
        <div>
          <span className="status-chip">{statusLabels[node.status]}</span>
          <h3>{node.title}</h3>
          <p>{node.summary}</p>
        </div>
      </section>

      <dl className="node-facts">
        <div>
          <dt>父节点</dt>
          <dd>{parent?.title ?? '无 · 学习起点'}</dd>
        </div>
        <div>
          <dt>子分支</dt>
          <dd>{childCount} 条</dd>
        </div>
        <div>
          <dt>节点状态</dt>
          <dd>{statusLabels[node.status]}</dd>
        </div>
      </dl>

      <section className="inspector-section">
        <div className="inspector-section__title">
          <h3>节点操作</h3>
          <span>选择动作会同步更新地图</span>
        </div>
        <div className="node-actions">
          <button
            className="node-action node-action--primary pixel-press"
            type="button"
            disabled={isLocked}
            onClick={onCreateBranch}
          >
            <PixelIcon name="plus" />
            <span><strong>创建概念分支</strong><small>隔离探索一个新问题</small></span>
          </button>
          <button
            className="node-action pixel-press"
            type="button"
            disabled={!canUseParent}
            onClick={onMerge}
          >
            <PixelIcon name="merge" />
            <span><strong>合并到父节点</strong><small>把本分支结论带回主线</small></span>
          </button>
          <button
            className="node-action pixel-press"
            type="button"
            disabled={!canUseParent}
            onClick={onReturnToParent}
          >
            <PixelIcon name="up" />
            <span><strong>返回父节点</strong><small>保留分支，回到上一层</small></span>
          </button>
          <button
            className="node-action pixel-press"
            type="button"
            disabled={isLocked || node.status === 'mastered'}
            onClick={onMarkMastered}
          >
            <PixelIcon name="check" />
            <span><strong>标记已掌握</strong><small>更新这条路径的学习状态</small></span>
          </button>
        </div>
      </section>

      <fieldset className="context-scope" disabled={isLocked}>
        <legend>上下文范围</legend>
        <label>
          <input
            type="radio"
            name="context-mode"
            checked={node.contextMode === 'inherit'}
            onChange={() => onContextModeChange('inherit')}
          />
          <span>
            <strong>继承父节点</strong>
            <small>沿用当前学习路径的上下文</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="context-mode"
            checked={node.contextMode === 'isolated'}
            onChange={() => onContextModeChange('isolated')}
          />
          <span>
            <strong>隔离同级分支</strong>
            <small>只读取祖先，不读取其他分支</small>
          </span>
        </label>
      </fieldset>
    </aside>
  )
}
