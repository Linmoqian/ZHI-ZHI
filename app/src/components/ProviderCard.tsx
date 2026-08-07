import { useState } from 'react'
import { PixelIcon, type PixelIconName } from './PixelIcon'
import type { ProviderConfig } from '../types'

type ProviderCardProps = {
  provider: ProviderConfig
  isActive: boolean
  isTesting: boolean
  testResult: { ok: boolean; message: string } | null
  onActivate: () => void
  onTest: () => void
  onSave: (patch: {
    label?: string
    endpoint?: string
    model?: string
    apiKey?: string | null
  }) => void
}

const kindIcon: Record<ProviderConfig['kind'], PixelIconName> = {
  local: 'server',
  cloud: 'cloud',
}

/**
 * 单个供应商配置卡片：方向、端点、模型、API Key（云端）、测试与设为生效。
 * 字段失焦即保存，避免显式提交按钮；API Key 单独保存按钮（避免空提交清空）。
 */
export function ProviderCard({
  provider,
  isActive,
  isTesting,
  testResult,
  onActivate,
  onTest,
  onSave,
}: ProviderCardProps) {
  const [label, setLabel] = useState(provider.label)
  const [endpoint, setEndpoint] = useState(provider.endpoint)
  const [model, setModel] = useState(provider.model)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const isCloud = provider.kind === 'cloud'

  const commitField = (field: 'label' | 'endpoint' | 'model', value: string) => {
    if (value.trim() && value !== provider[field]) {
      onSave({ [field]: value })
    }
  }

  const saveApiKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed) {
      onSave({ apiKey: trimmed })
      setApiKey('')
    }
  }

  const clearApiKey = () => {
    onSave({ apiKey: null })
    setApiKey('')
  }

  return (
    <article className={`provider-card tone-gray ${isActive ? 'is-active' : ''}`}>
      <header className="provider-card__head">
        <span className="provider-card__icon">
          <PixelIcon name={kindIcon[provider.kind]} />
        </span>
        <div className="provider-card__title">
          <input
            className="provider-input provider-input--label"
            type="text"
            value={label}
            aria-label="供应商名称"
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => commitField('label', label)}
          />
          <small className="provider-card__hint">
            {provider.kind === 'local' ? '本地推理' : '云端 API'}
            {provider.apiKeySet && provider.apiKeyMasked
              ? ` · Key ${provider.apiKeyMasked}`
              : ''}
          </small>
        </div>
        {isActive && (
          <span className="provider-active-tag">
            <PixelIcon name="check" />
            生效中
          </span>
        )}
      </header>

      <div className="provider-card__fields">
        <label className="provider-field">
          <span>端点</span>
          <input
            className="provider-input"
            type="text"
            value={endpoint}
            aria-label="端点地址"
            onChange={(e) => setEndpoint(e.target.value)}
            onBlur={() => commitField('endpoint', endpoint)}
          />
        </label>
        <label className="provider-field">
          <span>模型</span>
          <input
            className="provider-input"
            type="text"
            value={model}
            aria-label="模型名称"
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => commitField('model', model)}
          />
        </label>
        {isCloud && (
          <label className="provider-field">
            <span>API Key</span>
            <div className="provider-key-row">
              <input
                className="provider-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                placeholder={
                  provider.apiKeySet ? '已设置，输入新值替换' : '粘贴 API Key'
                }
                aria-label="API Key"
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                className="provider-icon-btn"
                aria-label={showKey ? '隐藏 Key' : '显示 Key'}
                onClick={() => setShowKey((v) => !v)}
              >
                <PixelIcon name={showKey ? 'eye-off' : 'eye'} />
              </button>
              <button
                type="button"
                className="provider-icon-btn"
                aria-label="保存 Key"
                disabled={!apiKey.trim()}
                onClick={saveApiKey}
              >
                <PixelIcon name="check" />
              </button>
              {provider.apiKeySet && (
                <button
                  type="button"
                  className="provider-icon-btn"
                  aria-label="清除 Key"
                  onClick={clearApiKey}
                >
                  <PixelIcon name="close" />
                </button>
              )}
            </div>
          </label>
        )}
      </div>

      <footer className="provider-card__foot">
        <button
          type="button"
          className="provider-action pixel-press"
          onClick={onTest}
          disabled={isTesting}
        >
          <PixelIcon name="signal" />
          {isTesting ? '测试中…' : '测试连接'}
        </button>
        {testResult && (
          <span
            className={`provider-test-result ${
              testResult.ok ? 'is-ok' : 'is-fail'
            }`}
          >
            <PixelIcon name={testResult.ok ? 'check' : 'info'} />
            {testResult.message}
          </span>
        )}
        {!isActive && (
          <button
            type="button"
            className="provider-action provider-action--primary pixel-press"
            onClick={onActivate}
          >
            <PixelIcon name="spark" />
            设为生效
          </button>
        )}
      </footer>
    </article>
  )
}
