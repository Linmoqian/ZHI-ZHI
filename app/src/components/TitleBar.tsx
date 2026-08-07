// 桌面无边框窗口的自定义标题栏。
//
// 桌面专属组件（见 AGENTS.md）：整个标题栏顶部为拖拽区，右侧为
// 最小化 / 最大化还原 / 关闭三个窗口控制按钮。
// 控制按钮不置于拖拽区，且全部可键盘聚焦（Tab + Enter/Space 触发）。
//
// 兼容 Web 预览：非 Tauri 内核时（isTauri() 为 false，如纯浏览器预览或
// 测试未注入内核）禁用窗口控制，避免点击触发无效 IPC 而抛 rejection。

import { useCallback, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

// 模块级计算一次：仅 Tauri 内核下请求窗口实例，Web 预览时为 null。
// getCurrentWindow() 惰性访问内核，选项部分（模块作用域）不带副作用。
const appWindow = isTauri() ? getCurrentWindow() : null

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  const handleMinimize = useCallback(() => {
    void appWindow?.minimize()
  }, [])

  const handleToggleMaximize = useCallback(async () => {
    if (!appWindow) {
      return
    }
    await appWindow.toggleMaximize()
    setIsMaximized(await appWindow.isMaximized())
  }, [])

  const handleClose = useCallback(() => {
    void appWindow?.close()
  }, [])

  // 双击标题栏拖拽区：切换最大化/还原。
  // 非 Tauri 环境（appWindow 为 null）时不响应，避免无效 IPC。
  const handleDoubleClick = useCallback(() => {
    void handleToggleMaximize()
  }, [handleToggleMaximize])

  return (
    <div
      className="title-bar"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      <button
        className="title-bar__drag-hit"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        data-tauri-drag-region
      />
      <div
        className="title-bar__controls"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          className="title-bar__control"
          type="button"
          aria-label="最小化"
          title="最小化"
          disabled={!appWindow}
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
          disabled={!appWindow}
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
          disabled={!appWindow}
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
