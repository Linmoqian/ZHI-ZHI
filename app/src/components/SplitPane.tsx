import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

/**
 * 可调整左右两栏占比的分隔面板。
 *
 * - 拖拽中间分隔条实时调整两栏宽度
 * - 双击分隔条切换地图的显示/隐藏（带 Motion 宽度动画）
 * - 地图隐藏后左侧露出「显示地图」竖条，点击恢复
 *
 * 拖拽期间通过 inline style 直接设 width，避免每帧触发 React 重渲染；
 * 拖拽结束时再提交 ratio 到 state。
 */

type SplitPaneProps = {
  /** 地图（左栏）节点 */
  left: React.ReactNode
  /** 对话（右栏）节点 */
  right: React.ReactNode
  /** 地图是否可见；由父组件控制，用于显影切换 */
  isLeftVisible: boolean
  /** 地图占比 0~1，受控值 */
  ratio: number
  /** 拖拽或双击后提交新 ratio */
  onRatioChange: (ratio: number) => void
  /** 显影切换回调（双击分隔条 / 点击露出竖条时触发） */
  onToggleLeft: () => void
}

/** 最小/最大占比约束，防止任一栏被压到不可用。 */
const MIN_RATIO = 0.22
const MAX_RATIO = 0.68
const VISIBLE_DURATION = 0.32

export function SplitPane({
  left,
  right,
  isLeftVisible,
  ratio,
  onRatioChange,
  onToggleLeft,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** 拖拽中的临时占比，直接写 inline style；拖拽结束才提交到父 state。 */
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const [isHovering, setIsHovering] = useState(false)

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

  // 组件卸载时清理可能残留的全局监听与样式
  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <div ref={containerRef} className="split-pane">
      <motion.div
        className="split-pane__left"
        animate={{ width: `${leftPercent}%` }}
        transition={{
          duration: dragRatio !== null ? 0 : VISIBLE_DURATION,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={
          dragRatio !== null
            ? { width: `${leftPercent}%`, transition: 'none' }
            : undefined
        }
      >
        {left}
      </motion.div>

      {isLeftVisible ? (
        <motion.button
          type="button"
          className={`split-pane__handle ${isHovering ? 'is-hover' : ''} ${
            dragRatio !== null ? 'is-dragging' : ''
          }`}
          aria-label="拖拽调整地图宽度，双击隐藏地图"
          title="拖拽调整宽度，双击隐藏地图"
          onPointerDown={handlePointerDown}
          onDoubleClick={onToggleLeft}
          onHoverStart={() => setIsHovering(true)}
          onHoverEnd={() => setIsHovering(false)}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.15 }}
        >
          <span className="split-pane__grip" />
        </motion.button>
      ) : (
        <motion.button
          type="button"
          className="split-pane__reveal"
          aria-label="显示对话地图"
          title="显示地图"
          onClick={onToggleLeft}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ x: 2 }}
          transition={{ duration: 0.2 }}
        >
          <span className="split-pane__reveal-icon" aria-hidden="true">
            ›
          </span>
          <span className="split-pane__reveal-label">地图</span>
        </motion.button>
      )}

      <div className="split-pane__right">{right}</div>
    </div>
  )
}
