import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PixelIcon } from './PixelIcon'
import {
  computeLayout,
  pathToRoot,
  toneForDepth,
  type PositionedTurn,
} from '../lib/turnTree'
import type { TurnDTO } from '../types'

type TurnNodeData = {
  turn: PositionedTurn
  isActive: boolean
  isOnActivePath: boolean
  onOpen: (turnId: string) => void
}

type TurnFlowNode = Node<TurnNodeData, 'turn'>
type TurnFlowEdge = Edge<{ active: boolean; tone: string }, 'turn'>

type TurnMapProps = {
  turns: TurnDTO[]
  activeLeafId: string | null
  draftMode: boolean
  onSelectTurn: (turnId: string) => void
}

const toneHex: Record<string, string> = {
  blue: '#4285ea',
  green: '#43b889',
  purple: '#9370d5',
  orange: '#e4a329',
}
const toneDark: Record<string, string> = {
  blue: '#2465c4',
  green: '#278b67',
  purple: '#704eae',
  orange: '#b9780d',
}
const toneLight: Record<string, string> = {
  blue: '#b7d3fa',
  green: '#aee4cf',
  purple: '#d2c0f1',
  orange: '#f8d98b',
}

function TurnNode({ data, selected }: NodeProps<TurnFlowNode>) {
  const { turn, isActive, isOnActivePath } = data
  const tone = toneForDepth(turn.depth)
  const color = toneHex[tone]
  const label =
    turn.userContent.length > 16
      ? `${turn.userContent.slice(0, 16)}…`
      : turn.userContent

  return (
    <button
      type="button"
      className={`pixel-node turn-node tone-${tone}${
        isActive ? ' is-current' : ''
      }${isOnActivePath ? ' on-path' : ''}${selected ? ' is-selected' : ''}`}
      style={{ '--tone': color } as React.CSSProperties}
      onClick={() => data.onOpen(turn.id)}
    >
      <Handle className="pixel-handle" type="target" position={Position.Top} />
      <span className="pixel-node__icon">
        <PixelIcon name={turn.isLeaf ? 'branch' : 'merge'} />
      </span>
      <span className="pixel-node__copy">
        <strong>{label}</strong>
      </span>
      <span
        className="pixel-node__foot pixel-node__foot--left"
        aria-hidden="true"
      />
      <span
        className="pixel-node__foot pixel-node__foot--right"
        aria-hidden="true"
      />
      <Handle
        className="pixel-handle"
        type="source"
        position={Position.Bottom}
      />
    </button>
  )
}

function TurnEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<TurnFlowEdge>) {
  const snap = (value: number) => Math.round(value / 4) * 4
  const middleX = snap(sourceX + (targetX - sourceX) / 2)
  const path = `M ${snap(sourceX)} ${snap(sourceY)} H ${middleX} V ${snap(targetY)} H ${snap(targetX)}`
  const tone = data?.tone ?? 'blue'
  const color = toneHex[tone] ?? toneHex.blue
  const darkColor = toneDark[tone] ?? toneDark.blue
  const lightColor = toneLight[tone] ?? toneLight.blue
  const active = data?.active

  return (
    <>
      <BaseEdge
        id={`${id}-shadow`}
        path={path}
        style={{
          stroke: '#c9c0b2',
          strokeWidth: 10,
          transform: 'translate(4px, 6px)',
          shapeRendering: 'crispEdges',
        }}
        interactionWidth={0}
      />
      <BaseEdge
        id={`${id}-depth`}
        path={path}
        style={{
          stroke: darkColor,
          strokeWidth: active ? 9 : 7,
          transform: 'translateY(2px)',
          shapeRendering: 'crispEdges',
        }}
        interactionWidth={0}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: active ? 6 : 4,
          shapeRendering: 'crispEdges',
        }}
        interactionWidth={18}
      />
      {active && (
        <BaseEdge
          id={`${id}-highlight`}
          path={path}
          style={{
            stroke: lightColor,
            strokeWidth: 2,
            transform: 'translate(-1px, -1px)',
            shapeRendering: 'crispEdges',
          }}
          interactionWidth={0}
        />
      )}
    </>
  )
}

const nodeTypes = { turn: TurnNode }
const edgeTypes = { turn: TurnEdge }

export function TurnMap({
  turns,
  activeLeafId,
  draftMode,
  onSelectTurn,
}: TurnMapProps) {
  const positioned = useMemo(() => computeLayout(turns), [turns])

  const activePathIds = useMemo(() => {
    if (!activeLeafId) {
      return new Set<string>()
    }
    return new Set(pathToRoot(turns, activeLeafId).map((t) => t.id))
  }, [activeLeafId, turns])

  const flowNodes: TurnFlowNode[] = useMemo(
    () =>
      positioned.map((turn) => ({
        id: turn.id,
        type: 'turn',
        position: { x: turn.x, y: turn.y },
        draggable: false,
        selected: turn.id === activeLeafId,
        data: {
          turn,
          isActive: turn.id === activeLeafId,
          isOnActivePath: activePathIds.has(turn.id),
          onOpen: onSelectTurn,
        },
      })),
    [positioned, activeLeafId, activePathIds, onSelectTurn],
  )

  const flowEdges: TurnFlowEdge[] = useMemo(
    () =>
      positioned.flatMap((turn) =>
        turn.parentId
          ? [
              {
                id: `${turn.parentId}-${turn.id}`,
                source: turn.parentId,
                target: turn.id,
                type: 'turn' as const,
                selectable: false,
                data: {
                  active: activePathIds.has(turn.id),
                  tone: toneForDepth(turn.depth),
                },
              },
            ]
          : [],
      ),
    [positioned, activePathIds],
  )

  return (
    <section className="workspace-panel map-panel" aria-label="对话地图">
      <header className="panel-header">
        <div>
          <span className="eyebrow">CONVERSATION MAP</span>
          <h2>对话地图</h2>
        </div>
        <span
          className="panel-swap-handle"
          role="button"
          tabIndex={0}
          aria-label="拖拽与对话面板互换位置"
          title="拖拽互换位置"
        >
          <PixelIcon name="exchange" />
        </span>
      </header>

      <div className="branch-canvas" data-testid="turn-map">
        {draftMode || turns.length === 0 ? (
          <div className="turn-map-empty">
            发出第一个问题，对话地图将从这里开始生长。
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable
            minZoom={0.35}
            maxZoom={1.6}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Lines}
              gap={20}
              size={0.5}
              color="#ddd5c7"
            />
            <Controls
              className="branch-controls"
              position="bottom-right"
              showInteractive={false}
            />
          </ReactFlow>
        )}
      </div>
    </section>
  )
}
