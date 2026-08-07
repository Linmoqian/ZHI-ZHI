// 回合树会话注册表：管理多个 TurnSessionStore 的生命周期与持久化。
//
// 职责：
// - 创建/获取/列举/恢复会话
// - 每个会话有独立的内容仓库（内容寻址按会话隔离）
// - 共享模型网关与持久化器
// - 启动时从持久化器恢复已有会话

import type {
  ProviderSettingsDTO,
  TestProviderResponse,
  TurnDTO,
  TurnSessionDTO,
  TurnSessionSummary,
  UpdateProviderRequest,
} from '../../shared/contracts.ts'
import type { Database } from 'better-sqlite3'
import { ApiError } from './errors.ts'
import { ContentStore } from './contentStore.ts'
import type { ModelGateway } from './modelGateway.ts'
import { TurnSessionStore } from './turnStore.ts'
import type { TurnPersistor } from './persistor.ts'
import { createSqlitePersistor } from './sqlitePersistor.ts'
import { noopGateway } from './noopGateway.ts'
import {
  buildGateway,
  defaultStoredSettings,
  loadProviderSettingsFromDb,
  saveProviderSettingsToDb,
  toSettingsDTO,
  type StoredProvider,
  type StoredProviderSettings,
} from './providerConfig.ts'

export type TurnStoreRegistryOptions = {
  modelGateway?: ModelGateway
  persistor?: TurnPersistor
  /** better-sqlite3 连接；提供后供应商配置持久化到 provider_settings 表。 */
  db?: Database
  initialProviders?: StoredProviderSettings
}

/**
 * 可委托的网关包装：所有会话通过它访问「当前生效供应商」。
 * 切换供应商时只需替换内部引用，无需重建会话。
 */
class GatewayDelegate implements ModelGateway {
  private current: ModelGateway
  constructor(initial: ModelGateway) {
    this.current = initial
  }
  set(next: ModelGateway) {
    this.current = next
  }
  complete(input: Parameters<ModelGateway['complete']>[0]) {
    return this.current.complete(input)
  }
  summarize(content: string) {
    return this.current.summarize(content)
  }
  testConnection() {
    return this.current.testConnection()
  }
}

export class TurnStoreRegistry {
  private readonly sessions = new Map<string, TurnSessionStore>()
  /** 可运行时切换的网关委托。 */
  private readonly gatewayDelegate: GatewayDelegate
  private readonly persistor?: TurnPersistor
  private readonly db?: Database
  /** 调用方显式注入的固定网关（测试占位），loadProviderSettings 不会覆盖它。 */
  private readonly injectedGateway?: ModelGateway
  /** 服务端内部配置（含 API Key 明文，绝不外传）。 */
  private providers: StoredProviderSettings

  constructor(options: TurnStoreRegistryOptions = {}) {
    this.persistor =
      options.persistor ??
      (options.db ? createSqlitePersistor(options.db) : undefined)
    this.db = options.db
    this.injectedGateway = options.modelGateway
    this.providers = options.initialProviders ?? defaultEmptySettings()
    const initial = options.modelGateway ?? noopGateway
    this.gatewayDelegate = new GatewayDelegate(initial)
  }

  /** 创建新会话（根回合）。 */
  async createSession(userContent: string): Promise<TurnSessionStore> {
    const normalized = userContent.trim()
    if (!normalized) {
      throw new ApiError(400, 'MESSAGE_REQUIRED', '用户输入不能为空')
    }

    const contentStore = new ContentStore()
    const store = await TurnSessionStore.create(
      normalized,
      normalized,
      contentStore,
      this.storeOptions(),
    )
    await store.persist()
    this.sessions.set(store.id, store)
    return store
  }

  /** 获取会话；未在内存时尝试从持久化器恢复。 */
  async getSession(sessionId: string): Promise<TurnSessionStore> {
    const cached = this.sessions.get(sessionId)
    if (cached) {
      return cached
    }
    if (!this.persistor) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', '学习会话不存在')
    }
    const dump = await this.persistor.load(sessionId)
    if (!dump) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', '学习会话不存在')
    }
    const restored = TurnSessionStore.restore(
      dump,
      new ContentStore(),
      this.storeOptions(),
    )
    this.sessions.set(restored.id, restored)
    return restored
  }

  /** 列举所有会话（首页最近学习）。 */
  async listSessions(): Promise<TurnSessionSummary[]> {
    const ids = this.persistor
      ? await this.persistor.listSessionIds()
      : [...this.sessions.keys()]
    const summaries: TurnSessionSummary[] = []
    for (const id of ids) {
      const store = await this.getSession(id)
      summaries.push({
        id: store.id,
        topic: store.topic,
        createdAt: store.createdAt,
        turnCount: store.listTurns().length,
      })
    }
    // 新会话优先，id 作为确定性平局决胜
    summaries.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )
    return summaries
  }

  /** 将会话序列化为可传输对象。 */
  toSessionDTO(store: TurnSessionStore): TurnSessionDTO {
    const turns = store.listTurns()
    return {
      id: store.id,
      topic: store.topic,
      createdAt: store.createdAt,
      turns: turns.map((turn) => ({
        id: turn.id,
        parentId: turn.parentId,
        userContent: store.contentStore.get(turn.userContentHash),
        assistantContent: store.contentStore.get(turn.assistantContentHash),
        createdAt: turn.createdAt,
      })),
    }
  }

  /** 将单个回合序列化为可传输对象。 */
  toTurnDTO(
    store: TurnSessionStore,
    turnId: string,
  ): TurnDTO {
    const turn = store.listTurns().find((t) => t.id === turnId)
    if (!turn) {
      throw new ApiError(404, 'TURN_NOT_FOUND', '回合不存在')
    }
    return {
      id: turn.id,
      parentId: turn.parentId,
      userContent: store.contentStore.get(turn.userContentHash),
      assistantContent: store.contentStore.get(turn.assistantContentHash),
      createdAt: turn.createdAt,
    }
  }

  private storeOptions() {
    return {
      modelGateway: this.gatewayDelegate,
      persistor: this.persistor,
    }
  }

  // -----------------------------------------------------------------
  // 供应商设置：加载 / 读取 / 更新 / 切换 / 测试
  // -----------------------------------------------------------------

  /**
   * 启动时加载供应商配置。未显式注入网关时才重建生效网关；
   * 测试等场景注入固定网关时保留之。
   */
  loadProviderSettings(): void {
    if (this.db) {
      this.providers = loadProviderSettingsFromDb(this.db)
    } else if (this.providers.providers.length === 0) {
      this.providers = defaultStoredSettings()
    }
    if (!this.injectedGateway) {
      this.applyActiveGateway()
    }
  }

  /** 返回当前设置 DTO（API Key 脱敏）。 */
  getProviderSettings(): ProviderSettingsDTO {
    return toSettingsDTO(this.providers)
  }

  /** 返回当前生效供应商的服务端记录（内部使用）。 */
  getActiveProvider(): StoredProvider {
    const active = this.providers.providers.find(
      (p) => p.id === this.providers.activeProviderId,
    )
    return (
      active ??
      this.providers.providers[0] ?? {
        id: '',
        kind: 'local',
        label: '',
        endpoint: '',
        model: '',
        apiKey: '',
      }
    )
  }

  /** 更新单个供应商字段（apiKey 省略/空串表示不变，null 表示清除）。 */
  async updateProvider(
    providerId: string,
    patch: UpdateProviderRequest,
  ): Promise<ProviderSettingsDTO> {
    const target = this.requireProvider(providerId)
    if (typeof patch.label === 'string' && patch.label.trim()) {
      target.label = patch.label.trim()
    }
    if (typeof patch.endpoint === 'string' && patch.endpoint.trim()) {
      target.endpoint = patch.endpoint.trim()
    }
    if (typeof patch.model === 'string' && patch.model.trim()) {
      target.model = patch.model.trim()
    }
    if (patch.apiKey !== undefined) {
      target.apiKey = patch.apiKey === null ? '' : patch.apiKey
    }
    this.persistProviders()
    // 若更新的是当前生效供应商，重建网关
    if (providerId === this.providers.activeProviderId) {
      this.applyActiveGateway()
    }
    return toSettingsDTO(this.providers)
  }

  /** 设为生效供应商。 */
  async setActiveProvider(providerId: string): Promise<ProviderSettingsDTO> {
    this.requireProvider(providerId)
    this.providers.activeProviderId = providerId
    this.persistProviders()
    this.applyActiveGateway()
    return toSettingsDTO(this.providers)
  }

  /** 测试某供应商的连通性（不改变生效状态）。 */
  async testProvider(providerId: string): Promise<TestProviderResponse> {
    const target = this.requireProvider(providerId)
    const gateway = buildGateway(target)
    const result = await gateway.testConnection()
    return { ok: result.ok, message: result.message }
  }

  private requireProvider(providerId: string): StoredProvider {
    const target = this.providers.providers.find((p) => p.id === providerId)
    if (!target) {
      throw new ApiError(404, 'PROVIDER_NOT_FOUND', '供应商不存在')
    }
    return target
  }

  /** 重建当前生效供应商对应的网关。 */
  private applyActiveGateway(): void {
    const active = this.getActiveProvider()
    this.gatewayDelegate.set(buildGateway(active))
  }

  /** 持久化供应商配置到 SQLite；无 db 时仅在内存。 */
  private persistProviders(): void {
    if (this.db) {
      saveProviderSettingsToDb(this.db, this.providers)
    }
  }
}

function defaultEmptySettings(): StoredProviderSettings {
  return { version: 1, providers: [], activeProviderId: '' }
}
