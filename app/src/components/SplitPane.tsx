import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/**
 * 可调整左右两栏占比的分隔面板。
 *
 * - 拖拽中间分隔条实时调整两栏宽度
 * - 拖拽任一面板的标题栏（header）到另一面板，可互换两栏位置
 *   （类似 VS Code 拖动视图标签）
 * - 双击分隔条切换左栏的显示/隐藏（带 Motion 宽度动画）
 * - 左栏隐藏后露出竖向「显示」条，点击恢复
 *
 * 拖拽宽度时通过 inline style 直接设 width，避免每帧触发 React 重渲染；
 * 拖拽结束时再提交 ratio 到 state。
 *
 * 面板互换通过 CSS order + Motion layout 动画，面板平滑滑过对方，
 * ratio 自动取补（互换后原左栏占比 0.35 → 新右栏占比 0.35）。
 */

type SplitPaneProps = {
  /** 左栏节点 */
  left: React.ReactNode
  /** 右栏节点 */
  right: React.ReactNode
  /** 左栏是否可见；由父组件控制，用于显影切换 */
  isLeftVisible: boolean
  /** 左栏占比 0~1，受控值 */
  ratio: number
  /** 拖拽或双击后提交新 ratio */
  onRatioChange: (ratio: number) => void
  /** 显影切换回调（双击分隔条 / 点击露出竖条时触发） */
  onToggleLeft: () => void
}

const MIN_RATIO = 0.22
const MAX_RATIO = 0.68
const SWAP_DURATION = 0.4
/** header 选择器：拖拽这些元素可互换面板。 */
const HEADER_SELECTOR = '.panel-header, .conversation-header'

export function SplitPane({
  left,
  right,
  isLeftVisible,
  ratio,
  onRatioChange,
  onToggleLeft,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isSwapped, setIsSwapped] = useState(false)
  /** 拖拽中的目标面板（'left' | 'right' | null）。 */
  const [dragOver, setDragOver] = useState<'left' | 'right' | null>(null)

  const effectiveRatio = dragRatio ?? ratio
  const leftPercent = isLeftVisible ? effectiveRatio * 100 : 0

  const clamp = useCallback((value: number) => {
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isLeftVisible) {
        return
      }
      event.preventDefault()
      const container = containerRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const move = (clientX: number) => {
        const next = clamp((clientX - rect.left) / rect.width)
        setDragRatio(next)
      }
      move(event.clientX)

      const onMove = (e: PointerEvent) => move(e.clientX)
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        setDragRatio((current) => {
          if (current !== null) {
            onRatioChange(current)
          }
          return null
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    },
    [clamp, isLeftVisible, onRatioChange],
  )

  /**
   * 面板互换。拖拽面板 header 到另一面板时触发。
   * 通过 CSS order 切换视觉位置，Motion layout 负责过渡动画；
   * ratio 取补，使原面板在新位置保持同等宽度。
   */
  const swap = useCallback(() => {
    onRatioChange(1 - ratio)
    setIsSwapped((swapped) => !swapped)
  }, [onRatioChange, ratio])

  // HTML5 拖拽：header 为拖拽源，面板容器为放置目标。
  // header 内的交互元素（按钮等）不触发拖拽，避免误操作。
  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (!target.closest(HEADER_SELECTOR)) {
        return
      }
      if (target.closest('button, input, textarea, select, a')) {
        return
      }
      event.dataTransfer.effectAllowed = 'move'
      // 用空透明图替代默认拖拽幽灵，避免视觉混乱（由 dragOver 高亮提示）。
      event.dataTransfer.setData('text/plain', 'panel-swap')
    },
    [],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, side: 'left' | 'right') => {
      if (!event.dataTransfer.types.includes('text/plain')) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDragOver(side)
    },
    [],
  )

  const handleDrop = useCallback(
    (side: 'left' | 'right') => {
      setDragOver(null)
      // 拖到另一侧才互换；拖回自身不操作。
      if (
        (side === 'left' && !isSwapped) ||
        (side === 'right' && isSwapped)
      ) {
        swap()
      }
    },
    [isSwapped, swap],
  )

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const leftOrder = isSwapped ? 3 : 1
  const rightOrder = isSwapped ? 1 : 3

  return (
    <div ref={containerRef} className="split-pane">
      <motion.div
        ref={leftRef}
        className={`split-pane__panel split-pane__left ${
          dragOver === 'left' ? 'is-drop-target' : ''
        }`}
        layout
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{ order: leftOrder, width: `${leftPercent}%` }}
        animate={{ width: `${leftPercent}%` }}
        draggable
        onDragStartCapture={handleDragStart}
        onDragOverCapture={(e) => handleDragOver(e, 'left')}
        onDragLeave={() =>
          setDragOver((current) => (current === 'left' ? null : current))
        }
        onDrop={() => handleDrop('left')}
      >
        {left}
      </motion.div>

      {isLeftVisible ? (
        <div className="split-pane__handle-slot" style={{ order: 2 }}>
          <motion.button
            type="button"
            className={`split-pane__handle ${isHovering ? 'is-hover' : ''} ${
              dragRatio !== null ? 'is-dragging' : ''
            }`}
            aria-label="拖拽调整宽度，双击隐藏左栏"
            title="拖拽调整宽度 · 双击隐藏"
            onPointerDown={handlePointerDown}
            onDoubleClick={onToggleLeft}
            onHoverStart={() => setIsHovering(true)}
            onHoverEnd={() => setIsHovering(false)}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.15 }}
          >
            <span className="split-pane__grip" />
          </motion.button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.button
            type="button"
            key="reveal"
            className={`split-pane__reveal ${isSwapped ? 'is-right' : ''}`}
            style={{ order: isSwapped ? 3 : 1 }}
            aria-label="显示隐藏的面板"
            title="显示面板"
            onClick={onToggleLeft}
            initial={{ opacity: 0, x: isSwapped ? 8 : -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            whileHover={{ x: isSwapped ? -2 : 2 }}
            transition={{ duration: 0.2 }}
          >
            <span className="split-pane__reveal-icon" aria-hidden="true">
              {isSwapped ? '‹' : '›'}
            </span>
            <span className="split-pane__reveal-label">
              {isSwapped ? '对话' : '地图'}
            </span>
          </motion.button>
        </AnimatePresence>
      )}

      <motion.div
        ref={rightRef}
        className={`split-pane__panel split-pane__right ${
          dragOver === 'right' ? 'is-drop-target' : ''
        }`}
        layout
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{ order: rightOrder }}
        draggable
        onDragStartCapture={handleDragStart}
        onDragOverCapture={(e) => handleDragOver(e, 'right')}
        onDragLeave={() =>
          setDragOver((current) => (current === 'right' ? null : current))
        }
        onDrop={() => handleDrop('right')}
      >
        {right}
      </motion.div>
    </div>
  )
}
