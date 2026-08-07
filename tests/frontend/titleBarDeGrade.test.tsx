import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// 非 Tauri 环境降级验证：独立文件（与 titleBar.test.tsx 分开），用 isTauri:false
// 的 mock 让 TitleBar 模块顶层判定为非桌面环境，确保 Web 预览下按钮禁用、不触发 IPC。
const { windowMock } = vi.hoisted(() => ({
  windowMock: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowMock,
}))

// 在模块系统完成 mock 后动态引入组件，使顶层 appWindow 判定为 null。
import { TitleBar } from '../../app/src/components/TitleBar'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TitleBar 在非 Tauri 环境下', () => {
  it('禁用全部窗口控制按钮', () => {
    render(<TitleBar />)
    for (const label of ['最小化', '最大化', '关闭']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })

  it('点击被禁用按钮不会触发窗口 IPC', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    const minimize = screen.getByRole('button', { name: '最小化' })
    await user.click(minimize)
    expect(windowMock.minimize).not.toHaveBeenCalled()
  })
})
