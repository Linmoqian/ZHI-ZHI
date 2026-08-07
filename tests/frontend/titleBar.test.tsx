import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TitleBar } from '../../app/src/components/TitleBar'

// 桌面壳 IPC：jsdom 下不存在 Tauri 运行时，整体 mock 窗口 API 与内核检测。
// vi.hoisted 保证 mock 工厂可安全引用这些 vi.fn。
const { windowMock } = vi.hoisted(() => ({
  windowMock: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn(),
    close: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  // 主用例统一视为 Tauri 环境；非 Tauri 降级场景见 degrade.test.tsx（隔离模块复位）。
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
  windowMock.isMaximized.mockResolvedValue(false)
})

describe('TitleBar', () => {
  it('渲染最小化 / 最大化 / 关闭三个控制按钮', () => {
    render(<TitleBar />)
    expect(
      screen.getByRole('button', { name: '最小化' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '最大化' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '关闭' }),
    ).toBeInTheDocument()
  })

  it('拖拽区元素带 data-tauri-drag-region 且不可聚焦', () => {
    render(<TitleBar />)
    const dragHit = document.querySelector('.title-bar__drag-hit')
    expect(dragHit).toHaveAttribute('data-tauri-drag-region')
    expect(dragHit).toHaveAttribute('tabindex', '-1')
  })

  it('点击最小化调用窗口 API', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: '最小化' }))
    expect(windowMock.minimize).toHaveBeenCalled()
  })

  it('点击最大化切换窗口状态并更新按钮标签', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: '最大化' }))
    expect(windowMock.toggleMaximize).toHaveBeenCalled()
    expect(windowMock.isMaximized).toHaveBeenCalled()
  })

  it('点击关闭调用窗口 API', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(windowMock.close).toHaveBeenCalled()
  })

  it('控制按钮可通过键盘触发（Tab 聚焦 + Enter 执行）', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    const closeButton = screen.getByRole('button', { name: '关闭' })
    closeButton.focus()
    await user.keyboard('{Enter}')
    expect(windowMock.close).toHaveBeenCalled()
  })

  it('双击标题栏切换最大化/还原', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.dblClick(document.querySelector('.title-bar')!)
    expect(windowMock.toggleMaximize).toHaveBeenCalled()
    expect(windowMock.isMaximized).toHaveBeenCalled()
  })
})
