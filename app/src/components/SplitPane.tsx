import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/**
 * 可调整左右两栏占比的分隔面板。
 *
 * - 拖拽中间分隔条实时调整两栏宽度
 *   拖拽期间直接操作 DOM（不经过 React state），保证逐帧实时渲染；
 *   松手时才提交 ratio 到 state。
 * - 拖拽任一面板的标题栏（header）可把整张卡片拖到另一侧互换位置
 *   （整卡片跟随指针，非截图幽灵）
 * - 双击分隔条切换左栏的显示/隐藏（带 Motion 宽度动画）
 * - 左栏隐藏后露出竖向「显示」条，点击恢复
 */

type SplitPaneProps = {
  left: React.ReactNode
  right: React.ReactNode
  isLeftVisible: boolean
  ratio: number
  onRatioChange: (ratio: number) => void
  onToggleLeft: () => void
}

type Side = 'left' | 'right'

const MIN_RATIO = 0.22
const MAX_RATIO = 0.68
const SWAP_DURATION = 0.4
/** 卡片互换拖拽手柄选择器：只有此元素可触发互换。 */
const SWAP_HANDLE_SELECTOR = '.panel-swap-handle'

const clampRatio = (value: number) =>
  Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))

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
  const [isHovering, setIsHovering] = useState(false)
  const [isSwapped, setIsSwapped] = useState(false)
  /** 是否正在拖拽宽度（用于禁用 layout 动画 + 切换 handle 样式）。 */
  const [isResizing, setIsResizing] = useState(false)

  /** 卡片拖拽互换状态。 */
  const [cardDrag, setCardDrag] = useState<{
    side: Side
    startX: number
    offset: number
    over: Side
  } | null>(null)

  const leftPercent = isLeftVisible ? ratio * 100 : 0

  /**
   * 分隔条拖拽：pointerdown 启动，拖拽中直接写 DOM width（实时渲染），
   * pointerup 提交 ratio 到 state。全程不触发 React 重渲染。
   */
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isLeftVisible) {
        return
      }
      event.preventDefault()
      const container = containerRef.current
      const leftEl = leftRef.current
      if (!container || !leftEl) {
        return
      }

      const rect = container.getBoundingClientRect()
      // 禁用 transition，拖拽期间宽度严格跟随指针
      leftEl.style.transition = 'none'
      setIsResizing(true)

      const apply = (clientX: number) => {
        const next = clampRatio((clientX - rect.left) / rect.width)
        // 直接操作 DOM——逐帧实时，无 React/motion 延迟
        leftEl.style.width = `${next * 100}%`
      }
      apply(event.clientX)

      const onMove = (e: PointerEvent) => apply(e.clientX)
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        // 读取最终宽度比例，提交到 state
        const finalRect = leftEl.getBoundingClientRect()
        const finalRatio = clampRatio(finalRect.width / rect.width)
        leftEl.style.transition = ''
        setIsResizing(false)
        onRatioChange(finalRatio)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    },
    [isLeftVisible, onRatioChange],
  )

  /** 面板互换：order 切换 + Motion layout 过渡，ratio 取补。 */
  const swap = useCallback(() => {
    onRatioChange(1 - ratio)
    setIsSwapped((swapped) => !swapped)
  }, [onRatioChange, ratio])

  /**
   * 卡片拖拽：pointerdown 落在 header 上时启动。
   * 拖拽中被拖卡片整体跟随指针平移；松手时若跨越中线则互换。
   */
  const handleCardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, side: Side) => {
      const target = event.target as HTMLElement
      if (!target.closest(SWAP_HANDLE_SELECTOR)) {
        return
      }
      if (target.closest('button, input, textarea, select, a')) {
        return
      }
      event.preventDefault()
      const container = containerRef.current
      if (!container) {
        return
      }
      const rect = container.getBoundingClientRect()
      const startX = event.clientX

      setCardDrag({ side, startX, offset: 0, over: side })
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'

      const onMove = (e: PointerEvent) => {
        const offset = e.clientX - startX
        const over: Side =
          e.clientX - rect.left < rect.width / 2 ? 'left' : 'right'
        setCardDrag((current) =>
          current ? { ...current, offset, over } : null,
        )
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        setCardDrag((current) => {
          if (current) {
            const draggedFromLeft = current.side === 'left'
            const shouldSwap = draggedFromLeft
              ? current.over === 'right'
              : current.over === 'left'
            if (shouldSwap) {
              setTimeout(swap, 0)
            }
          }
          return null
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [swap],
  )

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const leftOrder = isSwapped ? 3 : 1
  const rightOrder = isSwapped ? 1 : 3

  const isLeftDragTarget =
    cardDrag !== null && cardDrag.side !== 'left' && cardDrag.over === 'left'
  const isRightDragTarget =
    cardDrag !== null &&
    cardDrag.side !== 'right' &&
    cardDrag.over === 'right'

  // layout 动画仅在非拖拽时启用，避免与实时 DOM 操作冲突
  const enableLayout = !isResizing && cardDrag === null

  return (
    <div ref={containerRef} className="split-pane">
      <motion.div
        ref={leftRef}
        className={`split-pane__panel split-pane__left ${
          isLeftDragTarget ? 'is-drop-target' : ''
        } ${cardDrag?.side === 'left' ? 'is-dragging-card' : ''}`}
        layout={enableLayout}
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{
          order: leftOrder,
          width: `${leftPercent}%`,
          zIndex: cardDrag?.side === 'left' ? 30 : undefined,
        }}
        onPointerDown={(e) => handleCardPointerDown(e, 'left')}
      >
        <motion.div
          className="split-pane__card-inner"
          animate={{
            transform: `translateX(${cardDrag?.side === 'left' ? cardDrag.offset : 0}px)`,
          }}
          transition={
            cardDrag?.side === 'left'
              ? { type: 'spring', stiffness: 500, damping: 40 }
              : { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {left}
        </motion.div>
      </motion.div>

      {isLeftVisible ? (
        <div className="split-pane__handle-slot" style={{ order: 2 }}>
          <button
            type="button"
            className={`split-pane__handle ${isHovering ? 'is-hover' : ''} ${
              isResizing ? 'is-dragging' : ''
            }`}
            aria-label="拖拽调整宽度，双击隐藏左栏"
            title="拖拽调整宽度 · 双击隐藏"
            onPointerDown={handleResizePointerDown}
            onDoubleClick={onToggleLeft}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <span className="split-pane__grip" />
          </button>
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
            initial={{ opacity: 0, transform: `translateX(${isSwapped ? 8 : -8}px)` }}
            animate={{ opacity: 1, transform: 'translateX(0)' }}
            exit={{ opacity: 0 }}
            whileHover={{ transform: `translateX(${isSwapped ? -2 : 2}px)` }}
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
        className={`split-pane__panel split-pane__right ${
          isRightDragTarget ? 'is-drop-target' : ''
        } ${cardDrag?.side === 'right' ? 'is-dragging-card' : ''}`}
        layout={enableLayout}
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{
          order: rightOrder,
          zIndex: cardDrag?.side === 'right' ? 30 : undefined,
        }}
        onPointerDown={(e) => handleCardPointerDown(e, 'right')}
      >
        <motion.div
          className="split-pane__card-inner"
          animate={{
            transform: `translateX(${cardDrag?.side === 'right' ? cardDrag.offset : 0}px)`,
          }}
          transition={
            cardDrag?.side === 'right'
              ? { type: 'spring', stiffness: 500, damping: 40 }
              : { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {right}
        </motion.div>
      </motion.div>
    </div>
  )
}
