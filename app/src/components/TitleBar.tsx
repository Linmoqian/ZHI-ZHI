// 桌面无边框窗口的自定义标题栏。
//
// 桌面专属组件（见 AGENTS.md）：整个标题栏顶部为拖拽区，右侧为
// 最小化 / 最大化还原 / 关闭三个窗口控制按钮。
// 控制按钮不置于拖拽区，且全部可键盘聚焦（Tab + Enter/Space 触发）。

import { useCallback, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  const appWindow = getCurrentWindow()

  const handleMinimize = useCallback(() => {
    void appWindow.minimize()
  }, [appWindow])

  const handleToggleMaximize = useCallback(async () => {
    await appWindow.toggleMaximize()
    setIsMaximized(await appWindow.isMaximized())
  }, [appWindow])

  const handleClose = useCallback(() => {
    void appWindow.close()
  }, [appWindow])

  return (
    <div className="title-bar" data-tauri-drag-region>
      <button
        className="title-bar__drag-hit"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        data-tauri-drag-region
      />
      <div className="title-bar__controls">
        <button
          className="title-bar__control"
          type="button"
          aria-label="最小化"
          title="最小化"
          onClick={handleMinimize}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            <path d="M2 6h8" />
          </svg>
        </button>
        <button
          className="title-bar__control"
          type="button"
          aria-label={isMaximized ? '还原' : '最大化'}
          title={isMaximized ? '还原' : '最大化'}
          onClick={handleToggleMaximize}
        >
          {isMaximized ? (
            <svg aria-hidden="true" viewBox="0 0 12 12">
              <path d="M2 4h6v6H2z M4 2h6v6" fill="none" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 12 12">
              <path d="M2 2h8v8H2z" fill="none" />
            </svg>
          )}
        </button>
        <button
          className="title-bar__control title-bar__control--close"
          type="button"
          aria-label="关闭"
          title="关闭"
          onClick={handleClose}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
