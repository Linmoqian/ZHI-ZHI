import { ContextMenu } from '@base-ui/react/context-menu'
import type { ReactNode } from 'react'
import type {
  ContextMode,
  LearningNode,
  NodeAction,
  NodeStatus,
} from '../types'
import { PixelIcon } from './PixelIcon'

type NodeContextMenuProps = {
  node: LearningNode
  isCurrent: boolean
  children: ReactNode
  onOpen: () => void
  onAction: (action: NodeAction) => void
  onContextModeChange: (mode: ContextMode) => void
}

const statusLabels: Record<NodeStatus, string> = {
  current: '正在学习',
  exploring: '探索中',
  mastered: '已掌握',
  merged: '已合并',
  locked: '待解锁',
}

export function NodeContextMenu({
  node,
  isCurrent,
  children,
  onOpen,
  onAction,
  onContextModeChange,
}: NodeContextMenuProps) {
  const isLocked = node.status === 'locked'
  const canUseParent = Boolean(node.parentId) && !isLocked

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) {
          onOpen()
        }
      }}
    >
      <ContextMenu.Trigger
        className={`pixel-node tone-${node.tone} ${isCurrent ? 'is-current' : ''} ${isLocked ? 'is-locked' : ''}`}
        onClick={onOpen}
      >
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Positioner className="node-menu-positioner" sideOffset={8}>
          <ContextMenu.Popup className="node-menu-popup">
            <ContextMenu.Group>
              <ContextMenu.GroupLabel className="node-menu-label">
                <span className={`node-menu-cube tone-${node.tone}`} />
                <span>
                  <strong>{node.title}</strong>
                  <small>{statusLabels[node.status]}</small>
                </span>
              </ContextMenu.GroupLabel>
              <ContextMenu.Separator className="node-menu-separator" />
              <ContextMenu.Item
                className="node-menu-item node-menu-item--primary"
                disabled={isLocked}
                onClick={() => onAction('create-branch')}
              >
                <PixelIcon name="plus" />
                <span>创建概念分支</span>
                <kbd>N</kbd>
              </ContextMenu.Item>
              <ContextMenu.Item
                className="node-menu-item"
                disabled={!canUseParent}
                onClick={() => onAction('merge-parent')}
              >
                <PixelIcon name="merge" />
                <span>合并到父节点</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className="node-menu-item"
                disabled={!canUseParent}
                onClick={() => onAction('return-parent')}
              >
                <PixelIcon name="up" />
                <span>返回父节点</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className="node-menu-item"
                disabled={isLocked || node.status === 'mastered'}
                onClick={() => onAction('mark-mastered')}
              >
                <PixelIcon name="check" />
                <span>标记已掌握</span>
              </ContextMenu.Item>
            </ContextMenu.Group>

            <ContextMenu.Separator className="node-menu-separator" />
            <ContextMenu.Group>
              <ContextMenu.GroupLabel className="node-menu-section-title">
                上下文范围
              </ContextMenu.GroupLabel>
              <ContextMenu.RadioGroup
                value={node.contextMode}
                disabled={isLocked}
                onValueChange={(value) =>
                  onContextModeChange(value as ContextMode)
                }
              >
                <ContextMenu.RadioItem
                  className="node-menu-item node-menu-radio"
                  value="inherit"
                >
                  <span className="node-menu-radio__mark">
                    <ContextMenu.RadioItemIndicator>
                      <PixelIcon name="check" />
                    </ContextMenu.RadioItemIndicator>
                  </span>
                  <span>继承父节点</span>
                </ContextMenu.RadioItem>
                <ContextMenu.RadioItem
                  className="node-menu-item node-menu-radio"
                  value="isolated"
                >
                  <span className="node-menu-radio__mark">
                    <ContextMenu.RadioItemIndicator>
                      <PixelIcon name="check" />
                    </ContextMenu.RadioItemIndicator>
                  </span>
                  <span>隔离同级分支</span>
                </ContextMenu.RadioItem>
              </ContextMenu.RadioGroup>
            </ContextMenu.Group>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
