import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/**
 * 可调整左右两栏占比的分隔面板。
 *
 * - 拖拽中间分隔条实时调整两栏宽度
 * - 分隔条中央的交换按钮（⇄）可互换两栏位置（类似 VS Code 拖动视图）
 * - 双击分隔条切换左栏的显示/隐藏（带 Motion 宽度动画）
 * - 左栏隐藏后露出竖向「显示」条，点击恢复
 *
 * 拖拽期间通过 inline style 直接设 width，避免每帧触发 React 重渲染；
 * 拖拽结束时再提交 ratio 到 state。
 *
 * 互换时两栏用 Motion layout 动画平滑滑过对方位置，ratio 自动取补
 * （互换后原左栏占比 0.35 → 新右栏占比 0.35，即新左栏 0.65）。
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

export function SplitPane({
  left,
  right,
  isLeftVisible,
  ratio,
  onRatioChange,
  onToggleLeft,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isSwapped, setIsSwapped] = useState(false)

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

  /** 互换两栏位置；同时把 ratio 取补（左↔右占比对调）。 */
  const handleSwap = useCallback(() => {
    onRatioChange(1 - ratio)
    setIsSwapped((swapped) => !swapped)
  }, [onRatioChange, ratio])

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  // 互换后，原 left/right 的 DOM 顺序不变，仅靠 CSS order 交换视觉位置。
  // 这样 Motion 的 layout 动画能让两个面板平滑滑过对方。
  const leftOrder = isSwapped ? 3 : 1
  const rightOrder = isSwapped ? 1 : 3

  return (
    <div ref={containerRef} className="split-pane">
      <motion.div
        className="split-pane__panel split-pane__left"
        layout
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{
          order: leftOrder,
          width: `${leftPercent}%`,
        }}
        animate={{ width: `${leftPercent}%` }}
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
            title="拖拽调整宽度 · 双击隐藏 · 中央按钮互换位置"
            onPointerDown={handlePointerDown}
            onDoubleClick={onToggleLeft}
            onHoverStart={() => setIsHovering(true)}
            onHoverEnd={() => setIsHovering(false)}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.15 }}
          >
            <span className="split-pane__grip" />
          </motion.button>
          <button
            type="button"
            className="split-pane__swap"
            aria-label={isSwapped ? '交换回原位' : '互换左右两栏'}
            title={isSwapped ? '交换回原位' : '互换左右两栏'}
            onClick={handleSwap}
          >
            <SwapIcon rotated={isSwapped} />
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
        className="split-pane__panel split-pane__right"
        layout
        transition={{
          layout: { duration: SWAP_DURATION, ease: [0.22, 1, 0.36, 1] },
        }}
        style={{ order: rightOrder }}
      >
        {right}
      </motion.div>
    </div>
  )
}

function SwapIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      style={{
        transform: rotated ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.3s ease',
      }}
    >
      <path d="M3 5h9M9 2l3 3-3 3" />
      <path d="M13 11H4M7 8 4 11l3 3" />
    </svg>
  )
}
