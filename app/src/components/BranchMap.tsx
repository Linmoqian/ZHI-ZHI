import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type {
  CanvasPosition,
  LearningNode,
  NodeStatus,
  NodeTone,
} from '../types'
import { PixelIcon } from './PixelIcon'

type PixelNodeData = {
  title: string
  summary: string
  status: NodeStatus
  tone: NodeTone
  isCurrent: boolean
}

type PixelFlowNode = Node<PixelNodeData, 'pixel'>
type PixelFlowEdge = Edge<{ tone: NodeTone }, 'pixel'>

type BranchMapProps = {
  nodes: LearningNode[]
  currentNodeId: string
  onSelectNode: (nodeId: string) => void
  onMoveNode: (nodeId: string, position: CanvasPosition) => void
}

const toneColors: Record<NodeTone, string> = {
  blue: '#3d82ed',
  green: '#43b889',
  purple: '#9370d5',
  orange: '#e4a329',
  gray: '#a8a39a',
}

const statusLabels: Record<NodeStatus, string> = {
  current: '当前',
  exploring: '探索中',
  mastered: '已掌握',
  merged: '已合并',
  locked: '待解锁',
}

function PixelNode({ data, selected }: NodeProps<PixelFlowNode>) {
  const statusIcon =
    data.status === 'mastered'
      ? 'check'
      : data.status === 'locked'
        ? 'lock'
        : data.status === 'merged'
          ? 'merge'
          : 'branch'

  return (
    <div
      className={`pixel-node tone-${data.tone} ${data.isCurrent || selected ? 'is-current' : ''} ${data.status === 'locked' ? 'is-locked' : ''}`}
    >
      <Handle className="pixel-handle" type="target" position={Position.Top} />
      <span className="pixel-node__icon">
        <PixelIcon name={statusIcon} />
      </span>
      <span className="pixel-node__copy">
        <strong>{data.title}</strong>
        <small>{statusLabels[data.status]}</small>
      </span>
      <Handle className="pixel-handle" type="source" position={Position.Bottom} />
    </div>
  )
}

function PixelEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<PixelFlowEdge>) {
  const snap = (value: number) => Math.round(value / 4) * 4
  const middleY = snap(sourceY + (targetY - sourceY) / 2)
  const path = `M ${snap(sourceX)} ${snap(sourceY)} V ${middleY} H ${snap(targetX)} V ${snap(targetY)}`
  const color = data ? toneColors[data.tone] : toneColors.gray

  return (
    <>
      <BaseEdge
        id={`${id}-shadow`}
        path={path}
        style={{
          stroke: '#d1c9bb',
          strokeWidth: selected ? 8 : 7,
          transform: 'translate(3px, 4px)',
          shapeRendering: 'crispEdges',
        }}
        interactionWidth={0}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? 5 : 4,
          shapeRendering: 'crispEdges',
        }}
        interactionWidth={18}
      />
    </>
  )
}

const nodeTypes = { pixel: PixelNode }
const edgeTypes = { pixel: PixelEdge }

export function BranchMap({
  nodes,
  currentNodeId,
  onSelectNode,
  onMoveNode,
}: BranchMapProps) {
  const mappedFlowNodes = useMemo<PixelFlowNode[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'pixel',
        position: node.position,
        draggable: node.status !== 'locked',
        selected: node.id === currentNodeId,
        data: {
          title: node.title,
          summary: node.summary,
          status: node.status,
          tone: node.tone,
          isCurrent: node.id === currentNodeId,
        },
      })),
    [currentNodeId, nodes],
  )
  const [flowNodes, setFlowNodes, onFlowNodesChange] =
    useNodesState<PixelFlowNode>(mappedFlowNodes)

  useEffect(() => {
    setFlowNodes((currentFlowNodes) => {
      const currentById = new Map(
        currentFlowNodes.map((node) => [node.id, node]),
      )
      return mappedFlowNodes.map((node) => ({
        ...currentById.get(node.id),
        ...node,
      }))
    })
  }, [mappedFlowNodes, setFlowNodes])

  const flowEdges = useMemo<PixelFlowEdge[]>(
    () =>
      nodes.flatMap((node) =>
        node.parentId
          ? [
              {
                id: `${node.parentId}-${node.id}`,
                source: node.parentId,
                target: node.id,
                type: 'pixel' as const,
                selectable: true,
                data: { tone: node.tone },
              },
            ]
          : [],
      ),
    [nodes],
  )

  const handleNodeChanges = useCallback(
    (changes: NodeChange<PixelFlowNode>[]) => {
      onFlowNodesChange(changes)
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          onMoveNode(change.id, change.position)
        }
      })
    },
    [onFlowNodesChange, onMoveNode],
  )

  return (
    <section className="workspace-panel map-panel" aria-label="分支地图">
      <header className="panel-header">
        <div>
          <span className="eyebrow">BRANCH MAP</span>
          <h2>知识地图</h2>
        </div>
        <span className="panel-count">{nodes.length} 个节点</span>
      </header>

      <div className="map-legend" aria-label="节点状态图例">
        <span><i className="tone-blue" />当前路径</span>
        <span><i className="tone-green" />已掌握</span>
        <span><i className="tone-orange" />待探索</span>
      </div>

      <div className="branch-canvas" data-testid="branch-map">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodeChanges}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          nodesConnectable={false}
          elementsSelectable
          snapToGrid
          snapGrid={[4, 4]}
          minZoom={0.35}
          maxZoom={1.6}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          proOptions={{ hideAttribution: false }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={20}
            size={0.5}
            color="#ddd5c7"
          />
          <MiniMap
            className="branch-minimap"
            nodeColor={(node) =>
              toneColors[(node.data as PixelNodeData).tone]
            }
            nodeStrokeWidth={3}
            maskColor="rgba(249, 246, 238, 0.72)"
            pannable
            zoomable
          />
          <Controls className="branch-controls" showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  )
}
