import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from '../../app/src/components/SettingsView'
import type { ProviderSettingsDTO } from '../../app/src/types'

vi.mock('../../app/src/services/settingsApi', () => ({
  settingsApi: {
    listProviders: vi.fn(),
    updateProvider: vi.fn(),
    setActive: vi.fn(),
    testConnection: vi.fn(),
  },
}))

import { settingsApi } from '../../app/src/services/settingsApi'

const localProvider = {
  id: 'provider-local-ollama',
  kind: 'local' as const,
  label: '本地 Ollama',
  endpoint: 'http://127.0.0.1:11434',
  model: 'llama2:latest',
  apiKeySet: false,
}

const cloudProvider = {
  id: 'provider-cloud-deepseek',
  kind: 'cloud' as const,
  label: 'DeepSeek',
  endpoint: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKeySet: false,
}

const sampleSettings: ProviderSettingsDTO = {
  providers: [localProvider, cloudProvider],
  activeProviderId: localProvider.id,
  active: { id: localProvider.id, kind: 'local', label: '本地 Ollama' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(settingsApi.listProviders).mockResolvedValue(sampleSettings)
})

describe('SettingsView', () => {
  it('加载并渲染本地与云端两个方向', async () => {
    render(<SettingsView onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('本地大模型')).toBeInTheDocument()
      expect(screen.getByText('云端大模型')).toBeInTheDocument()
      // label 为 input value
      expect(screen.getByDisplayValue('DeepSeek')).toBeInTheDocument()
    })
  })

  it('云端 DeepSeek 卡片展示官方文档外链', async () => {
    render(<SettingsView onClose={vi.fn()} />)
    await waitFor(() => {
      const docsLink = screen.getByText('查看 DeepSeek 接口文档').closest('a')
      expect(docsLink).toHaveAttribute(
        'href',
        'https://api-docs.deepseek.com/zh-cn/',
      )
    })
  })

  it('点击设为生效调用 setActive', async () => {
    const user = userEvent.setup()
    vi.mocked(settingsApi.setActive).mockResolvedValue({
      ...sampleSettings,
      activeProviderId: cloudProvider.id,
      active: { id: cloudProvider.id, kind: 'cloud', label: 'DeepSeek' },
    })
    render(<SettingsView onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '设为生效' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: '设为生效' }))
    await waitFor(() => {
      expect(settingsApi.setActive).toHaveBeenCalledWith(cloudProvider.id)
    })
  })

  it('点击测试连接调用 testConnection 并显示结果', async () => {
    const user = userEvent.setup()
    vi.mocked(settingsApi.testConnection).mockResolvedValue({
      ok: true,
      message: '已连接',
    })
    render(<SettingsView onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '测试连接' }).length).toBeGreaterThan(0),
    )

    await user.click(screen.getAllByRole('button', { name: '测试连接' })[0])
    await waitFor(() => {
      expect(screen.getByText('已连接')).toBeInTheDocument()
    })
  })

  it('关闭按钮触发 onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsView onClose={onClose} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '关闭设置' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: '关闭设置' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Esc 键关闭', async () => {
    const onClose = vi.fn()
    render(<SettingsView onClose={onClose} />)
    await waitFor(() =>
      expect(screen.getByText('本地大模型')).toBeInTheDocument(),
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
