// 模型供应商配置：加载、脱敏、校验与环境变量合并。
//
// 持久化到 SQLite 的 provider_settings 表（见 db.ts），不再使用独立 JSON 文件。
// 内置默认：本地 Ollama + 云端 DeepSeek（deepseek-v4-flash）。
// API Key 仅保存在服务端，对外 DTO 做脱敏；环境变量可作为部署级覆盖。

import type { Database } from 'better-sqlite3'
import type {
  ActiveProvider,
  ProviderConfig,
  ProviderKind,
  ProviderSettingsDTO,
} from '../../shared/contracts.ts'
import {
  createDeepSeekGateway,
  createOllamaGateway,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OLLAMA_ENDPOINT,
  type ModelGateway,
} from './modelGateway.ts'

/** 服务端内部存储的供应商记录（包含 API Key 明文，绝不外泄）。 */
export type StoredProvider = {
  id: string
  kind: ProviderKind
  label: string
  endpoint: string
  model: string
  /** 服务端明文保存的 API Key；本地供应商为空。 */
  apiKey: string
}

/** 服务端配置内存结构。 */
export type StoredProviderSettings = {
  version: 1
  providers: StoredProvider[]
  activeProviderId: string
}

export const CONFIG_FILE_NAME = 'zhizhi.config.json'

/** 本地内置默认供应商 id，固定以便持久化前后稳定引用。 */
export const LOCAL_PROVIDER_ID = 'provider-local-ollama'
export const CLOUD_PROVIDER_ID = 'provider-cloud-deepseek'

/** 生成内置默认配置（首次启动或配置丢失时）。 */
export function defaultStoredSettings(): StoredProviderSettings {
  return {
    version: 1,
    providers: [
      {
        id: LOCAL_PROVIDER_ID,
        kind: 'local',
        label: '本地 Ollama',
        endpoint: DEFAULT_OLLAMA_ENDPOINT,
        model: resolveOllamaModel(),
        apiKey: '',
      },
      {
        id: CLOUD_PROVIDER_ID,
        kind: 'cloud',
        label: 'DeepSeek',
        endpoint: DEFAULT_DEEPSEEK_BASE_URL,
        model: DEFAULT_DEEPSEEK_MODEL,
        apiKey: '',
      },
    ],
    activeProviderId: LOCAL_PROVIDER_ID,
  }
}

function resolveOllamaModel(): string {
  const explicit = process.env.ZHIZHI_MODEL?.trim()
  return explicit || 'llama2:latest'
}

/** 合并环境变量覆盖（部署级，优先于配置文件中的字段）。 */
function applyEnvOverrides(settings: StoredProviderSettings): void {
  const deepseekKey = process.env.ZHIZHI_DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    const cloud = settings.providers.find((p) => p.id === CLOUD_PROVIDER_ID)
    if (cloud) {
      cloud.apiKey = deepseekKey
    }
  }
  const ollamaEndpoint = process.env.ZHIZHI_OLLAMA_ENDPOINT?.trim()
  if (ollamaEndpoint) {
    const local = settings.providers.find((p) => p.id === LOCAL_PROVIDER_ID)
    if (local) {
      local.endpoint = ollamaEndpoint
    }
  }
}

/** 从 SQLite provider_settings 表加载配置；表为空时使用内置默认。 */
export function loadProviderSettingsFromDb(
  db: Database,
): StoredProviderSettings {
  const rows = getAllProviderRows(db)
  const providers: StoredProvider[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind === 'cloud' ? 'cloud' : 'local',
    label: r.label,
    endpoint: r.endpoint,
    model: r.model,
    apiKey: r.api_key,
  }))

  // 覆写回内存默认 + DB 已有值，确保内置供应商始终存在、字段补齐。
  const merged = mergeStored({ providers: normalizeStoredList(providers) })
  const activeRow = rows.find((r) => r.is_active === 1)
  merged.activeProviderId =
    activeRow && merged.providers.some((p) => p.id === activeRow.id)
      ? activeRow.id
      : merged.providers[0].id
  applyEnvOverrides(merged)
  if (merged.providers.length === 0) {
    merged.providers.push(...defaultStoredSettings().providers)
    merged.activeProviderId = defaultStoredSettings().activeProviderId
  }
  return merged
}

/** 以事务把配置写入 SQLite provider_settings 表。 */
export function saveProviderSettingsToDb(
  db: Database,
  settings: StoredProviderSettings,
): void {
  const stmt = db.prepare(
    `INSERT INTO provider_settings (id, kind, label, endpoint, model, api_key, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       label = excluded.label,
       endpoint = excluded.endpoint,
       model = excluded.model,
       api_key = excluded.api_key,
       is_active = excluded.is_active`,
  )
  const tx = db.transaction(() => {
    for (const p of settings.providers) {
      stmt.run(
        p.id,
        p.kind,
        p.label,
        p.endpoint,
        p.model,
        p.apiKey,
        p.id === settings.activeProviderId ? 1 : 0,
      )
    }
  })
  tx()
}

/** 从 DB 读出全部供应商行（用于加载）。 */
function getAllProviderRows(db: Database) {
  return db
    .prepare(`SELECT * FROM provider_settings`)
    .all() as Array<{
    id: string
    kind: string
    label: string
    endpoint: string
    model: string
    api_key: string
    is_active: number
  }>
}

/** 仅规范化供应商列表（供加载时从 DB 行构造）。 */
function normalizeStoredList(providers: StoredProvider[]): StoredProvider[] {
  const defaults = defaultStoredSettings()
  const merged = [...providers]
  // 确保内置供应商始终存在
  for (const preset of defaults.providers) {
    if (!merged.some((p) => p.id === preset.id)) {
      merged.push({ ...preset })
    }
  }
  return merged
    .filter(isValidStoredProvider)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label || defaultLabelFor(p.kind),
      endpoint: p.endpoint || defaultEndpointFor(p.kind),
      model: p.model || defaultModelFor(p.kind),
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    }))
}

/** 合并部分 StoredProviderSettings，补齐默认。 */
function mergeStored(
  partial: Partial<StoredProviderSettings>,
): StoredProviderSettings {
  const defaults = defaultStoredSettings()
  return normalizeStored({
    version: 1,
    providers: partial.providers ?? defaults.providers,
    activeProviderId: partial.activeProviderId ?? defaults.activeProviderId,
  })
}

/**
 * 校验并规范化已加载/已解析的配置：补全缺失字段、修复失效的 active id。
 * 保持向后兼容：未知字段忽略，缺失供应商回退到默认并合并。
 */
function normalizeStored(parsed: unknown): StoredProviderSettings {
  const defaults = defaultStoredSettings()
  if (typeof parsed !== 'object' || parsed === null) {
    return defaults
  }
  const obj = parsed as Partial<StoredProviderSettings>
  let providers = Array.isArray(obj.providers) ? obj.providers : []

  // 确保内置供应商始终存在（id 不变）
  for (const preset of defaults.providers) {
    if (!providers.some((p) => p.id === preset.id)) {
      providers.push({ ...preset })
    }
  }

  // 过滤非法记录并补全字段
  providers = providers
    .filter(isValidStoredProvider)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label || defaultLabelFor(p.kind),
      endpoint: p.endpoint || defaultEndpointFor(p.kind),
      model: p.model || defaultModelFor(p.kind),
      apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    }))

  const validIds = new Set(providers.map((p) => p.id))
  const activeProviderId = validIds.has(obj.activeProviderId ?? '')
    ? (obj.activeProviderId as string)
    : defaults.activeProviderId

  return { version: 1, providers, activeProviderId }
}

function isValidStoredProvider(value: unknown): value is StoredProvider {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Partial<StoredProvider>
  return (
    typeof v.id === 'string' &&
    (v.kind === 'local' || v.kind === 'cloud') &&
    typeof v.label === 'string'
  )
}

function defaultLabelFor(kind: ProviderKind): string {
  return kind === 'local' ? '本地模型' : '云端模型'
}

function defaultEndpointFor(kind: ProviderKind): string {
  return kind === 'local'
    ? DEFAULT_OLLAMA_ENDPOINT
    : DEFAULT_DEEPSEEK_BASE_URL
}

function defaultModelFor(kind: ProviderKind): string {
  return kind === 'local' ? 'llama2:latest' : DEFAULT_DEEPSEEK_MODEL
}

/** 把 API Key 脱敏为 sk-****1234 形式；过短或为空返回空串。 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length < 8) {
    return ''
  }
  const dashIndex = trimmed.indexOf('-')
  const headEnd = dashIndex >= 0 ? dashIndex + 1 : 3
  const head = trimmed.slice(0, headEnd)
  const tail = trimmed.slice(-4)
  return `${head}****${tail}`
}

/** 转为对外 DTO（脱敏 API Key）。 */
export function toProviderDTO(provider: StoredProvider): ProviderConfig {
  return {
    id: provider.id,
    kind: provider.kind,
    label: provider.label,
    endpoint: provider.endpoint,
    model: provider.model,
    apiKeySet: provider.apiKey.trim().length > 0,
    apiKeyMasked:
      provider.kind === 'cloud' ? maskApiKey(provider.apiKey) : undefined,
  }
}

/** 整体转 DTO，并附带当前激活供应商摘要。 */
export function toSettingsDTO(
  settings: StoredProviderSettings,
): ProviderSettingsDTO {
  const active = settings.providers.find(
    (p) => p.id === settings.activeProviderId,
  )
  const activeSummary: ActiveProvider = active
    ? { id: active.id, kind: active.kind, label: active.label }
    : { id: '', kind: 'local', label: '' }
  return {
    providers: settings.providers.map(toProviderDTO),
    activeProviderId: settings.activeProviderId,
    active: activeSummary,
  }
}

/** 根据存储记录构建对应网关。 */
export function buildGateway(provider: StoredProvider): ModelGateway {
  if (provider.kind === 'cloud') {
    return createDeepSeekGateway({
      apiKey: provider.apiKey,
      baseUrl: provider.endpoint,
      model: provider.model,
    })
  }
  return createOllamaGateway({
    endpoint: provider.endpoint,
    model: provider.model,
  })
}
