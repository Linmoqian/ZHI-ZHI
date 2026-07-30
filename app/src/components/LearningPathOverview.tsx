import { useMemo, type KeyboardEvent } from 'react'
import type { LearningNode, NodeTone } from '../types'

type LearningPathOverviewProps = {
  nodes: LearningNode[]
  currentNodeId: string
  className?: string
  onSelectNode?: (nodeId: string) => void
}

const toneColors: Record<NodeTone, string> = {
  blue: '#4285ea',
  green: '#43b889',
  purple: '#9370d5',
  orange: '#e4a329',
  gray: '#a8a39a',
}

const overviewWidth = 220
const horizontalPadding = 18
const verticalPadding = 18
const levelGap = 38

function buildOverviewNodes(nodes: LearningNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, LearningNode[]>()

  nodes.forEach((node) => {
    if (!node.parentId || !nodeById.has(node.parentId)) {
      return
    }
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })

  const roots = nodes.filter(
    (node) => !node.parentId || !nodeById.has(node.parentId),
  )
  const levels: LearningNode[][] = []
  const visited = new Set<string>()
  let frontier = roots

  while (frontier.length > 0) {
    levels.push(frontier)
    frontier.forEach((node) => visited.add(node.id))
    frontier = frontier.flatMap(
      (node) => childrenByParent.get(node.id) ?? [],
    )
  }

  const unplacedNodes = nodes.filter((node) => !visited.has(node.id))
  if (unplacedNodes.length > 0) {
    levels.push(unplacedNodes)
  }

  const positionedNodes = levels.flatMap((level, levelIndex) =>
    level.map((node, nodeIndex) => ({
      node,
      x:
        horizontalPadding +
        ((overviewWidth - horizontalPadding * 2) * (nodeIndex + 1)) /
          (level.length + 1),
      y: verticalPadding + levelIndex * levelGap,
    })),
  )

  return {
    height: Math.max(
      92,
      verticalPadding * 2 + Math.max(0, levels.length - 1) * levelGap,
    ),
    positionedNodes,
  }
}

export function LearningPathOverview({
  nodes,
  currentNodeId,
  className = '',
  onSelectNode,
}: LearningPathOverviewProps) {
  const { height, positionedNodes } = useMemo(
    () => buildOverviewNodes(nodes),
    [nodes],
  )
  const positionById = new Map(
    positionedNodes.map((item) => [item.node.id, item]),
  )

  const selectNode = (nodeId: string) => {
    onSelectNode?.(nodeId)
  }

  const handleNodeKeyDown = (
    event: KeyboardEvent<SVGGElement>,
    nodeId: string,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectNode(nodeId)
    }
  }

  return (
    <div className={`learning-path-overview ${className}`.trim()}>
      <svg
        viewBox={`0 0 ${overviewWidth} ${height}`}
        role="img"
        aria-label="学习路径简图"
      >
        <g className="learning-path-overview__edges" aria-hidden="true">
          {positionedNodes.map(({ node, x, y }) => {
            const parent = node.parentId
              ? positionById.get(node.parentId)
              : null
            if (!parent) {
              return null
            }
            const middleY = parent.y + (y - parent.y) / 2
            const path = `M ${parent.x} ${parent.y} V ${middleY} H ${x} V ${y}`

            return (
              <g key={`${parent.node.id}-${node.id}`}>
                <path
                  className="learning-path-overview__edge-shadow"
                  d={path}
                />
                <path
                  d={path}
                  style={{ stroke: toneColors[node.tone] }}
                />
              </g>
            )
          })}
        </g>

        <g className="learning-path-overview__nodes">
          {positionedNodes.map(({ node, x, y }) => {
            const isCurrent = node.id === currentNodeId
            const size = isCurrent ? 16 : 12
            const offset = size / 2

            return (
              <g
                className={`learning-path-overview__node ${
                  isCurrent ? 'is-current' : ''
                }`}
                key={node.id}
                role={onSelectNode ? 'button' : undefined}
                tabIndex={onSelectNode ? 0 : undefined}
                aria-label={
                  onSelectNode
                    ? `打开节点：${node.title}`
                    : undefined
                }
                onClick={() => selectNode(node.id)}
                onKeyDown={(event) =>
                  handleNodeKeyDown(event, node.id)
                }
              >
                <rect
                  className="learning-path-overview__node-shadow"
                  x={x - offset + 2}
                  y={y - offset + 3}
                  width={size}
                  height={size}
                />
                <rect
                  x={x - offset}
                  y={y - offset}
                  width={size}
                  height={size}
                  style={{ fill: toneColors[node.tone] }}
                />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
