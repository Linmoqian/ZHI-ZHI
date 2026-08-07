import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { PixelIcon } from './PixelIcon'
import { ProviderCard } from './ProviderCard'
import { settingsApi } from '../services/settingsApi'
import { LearningApiError } from '../services/apiError'
import {
  saveActiveProviderKind,
} from '../lib/providerConfig'
import type { ProviderConfig, ProviderSettingsDTO } from '../types'

const DEEPSEEK_DOCS_URL = 'https://api-docs.deepseek.com/zh-cn/'

type SettingsViewProps = {
  onClose: () => void
}

type TestState = Record<
  string,
  { isTesting: boolean; result: { ok: boolean; message: string } | null }
>

/**
 * 设置界面：以本地 / 云端两个方向组织供应商。
 * 云端默认提供 DeepSeek。配置实时落盘到服务端，前端仅持有脱敏快照。
 */
export function SettingsView({ onClose }: SettingsViewProps) {
  const [settings, setSettings] = useState<ProviderSettingsDTO | null>(null)
  const [error, setError] = useState('')
  const [tests, setTests] = useState<TestState>({})

  const refresh = useCallback(async () => {
    try {
      const data = await settingsApi.listProviders()
      setSettings(data)
      saveActiveProviderKind(data.active.kind)
    } catch (e) {
      setError(toMessage(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = useCallback(
    async (
      providerId: string,
      patch: {
        label?: string
        endpoint?: string
        model?: string
        apiKey?: string | null
      },
    ) => {
      try {
        const next = await settingsApi.updateProvider(providerId, patch)
        setSettings(next)
      } catch (e) {
        setError(toMessage(e))
      }
    },
    [],
  )

  const handleActivate = useCallback(
    async (providerId: string, kind: ProviderConfig['kind']) => {
      try {
        const next = await settingsApi.setActive(providerId)
        setSettings(next)
        saveActiveProviderKind(kind)
      } catch (e) {
        setError(toMessage(e))
      }
    },
    [],
  )

  const handleTest = useCallback(async (providerId: string) => {
    setTests((prev) => ({
      ...prev,
      [providerId]: { isTesting: true, result: prev[providerId]?.result ?? null },
    }))
    try {
      const result = await settingsApi.testConnection(providerId)
      setTests((prev) => ({
        ...prev,
        [providerId]: { isTesting: false, result },
      }))
    } catch (e) {
      setTests((prev) => ({
        ...prev,
        [providerId]: {
          isTesting: false,
          result: { ok: false, message: toMessage(e) },
        },
      }))
    }
  }, [])

  const localProviders =
    settings?.providers.filter((p) => p.kind === 'local') ?? []
  const cloudProviders =
    settings?.providers.filter((p) => p.kind === 'cloud') ?? []

  return (
    <motion.div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <motion.section
        className="settings-panel pixel-panel"
        initial={{ transform: 'translateY(16px)', opacity: 0 }}
        animate={{ transform: 'translateY(0)', opacity: 1 }}
        exit={{ transform: 'translateY(8px)', opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="settings-header">
          <div>
            <span className="eyebrow">SETTINGS</span>
            <h2>设置 · 模型供应商</h2>
          </div>
          <button
            type="button"
            className="settings-close pixel-press"
            aria-label="关闭设置"
            onClick={onClose}
          >
            <PixelIcon name="close" />
          </button>
        </header>

        {error && (
          <div className="settings-error" role="alert">
            <PixelIcon name="info" />
            {error}
          </div>
        )}

        <div className="settings-body">
          <SettingsSection
            icon="server"
            title="本地大模型"
            subtitle="在本机或局域网运行的推理服务，数据不出本地"
          >
            {localProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isActive={provider.id === settings?.activeProviderId}
                isTesting={tests[provider.id]?.isTesting ?? false}
                testResult={tests[provider.id]?.result ?? null}
                onActivate={() => handleActivate(provider.id, provider.kind)}
                onTest={() => handleTest(provider.id)}
                onSave={(patch) => handleSave(provider.id, patch)}
              />
            ))}
          </SettingsSection>

          <SettingsSection
            icon="cloud"
            title="云端大模型"
            subtitle="通过官方 API 调用云端模型，默认提供 DeepSeek"
            docsUrl={DEEPSEEK_DOCS_URL}
            docsLabel="查看 DeepSeek 接口文档"
          >
            {cloudProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isActive={provider.id === settings?.activeProviderId}
                isTesting={tests[provider.id]?.isTesting ?? false}
                testResult={tests[provider.id]?.result ?? null}
                onActivate={() => handleActivate(provider.id, provider.kind)}
                onTest={() => handleTest(provider.id)}
                onSave={(patch) => handleSave(provider.id, patch)}
              />
            ))}
          </SettingsSection>
        </div>
      </motion.section>
    </motion.div>
  )
}

function SettingsSection({
  icon,
  title,
  subtitle,
  docsUrl,
  docsLabel,
  children,
}: {
  icon: Parameters<typeof PixelIcon>[0]['name']
  title: string
  subtitle: string
  docsUrl?: string
  docsLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="settings-section">
      <div className="settings-section__head">
        <span className="settings-section__icon">
          <PixelIcon name={icon} />
        </span>
        <div>
          <h3>{title}</h3>
          <small>{subtitle}</small>
        </div>
        {docsUrl && (
          <a
            className="settings-docs-link"
            href={docsUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <PixelIcon name="external" />
            {docsLabel}
          </a>
        )}
      </div>
      <div className="settings-section__cards">{children}</div>
    </section>
  )
}

function toMessage(error: unknown): string {
  return error instanceof LearningApiError
    ? error.message
    : '操作失败，请稍后重试'
}
