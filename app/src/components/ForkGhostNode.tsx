import type { Node, NodeProps } from '@xyflow/react'
import { PixelIcon } from './PixelIcon'

/** 待定分叉虚影节点的数据。 */
export type GhostNodeData = {
  parentLabel: string
}

export type ForkGhostFlowNode = Node<GhostNodeData, 'ghost'>

/**
 * 待定分叉的白色虚影节点：虚线轮廓、轻微呼吸柔光，提示正等待新链输入。
 * 仅在用户点击「分叉」后、真正输入提交前显示。
 */
export function ForkGhostNode({
  data,
}: NodeProps<ForkGhostFlowNode>) {
  return (
    <div
      className="fork-ghost"
      aria-label="待生长的分叉新节点"
      role="presentation"
    >
      <span className="fork-ghost__icon">
        <PixelIcon name="plus" />
      </span>
      <span className="fork-ghost__copy">
        <strong>从「{data.parentLabel}」分叉</strong>
        <small>输入内容即成新链</small>
      </span>
    </div>
  )
}
