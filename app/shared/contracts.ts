export type ApiErrorPayload = {
  error: {
    code: string
    message: string
  }
}

// ============================================================================
// 回合树 API 契约（Turn Tree）
//
// 详见 docs/回合树重构.md。一个回合 = 一次用户输入 + 一次模型输出；
// 回合间通过 parentId 形成树，地图 = 树本身。
// ============================================================================

/** 回合数据传输对象：内容已解析为明文，供前端直接渲染。 */
export type TurnDTO = {
  id: string
  parentId: string | null
  userContent: string
  assistantContent: string
  createdAt: string
}

/** 回合树会话：一棵回合树。 */
export type TurnSessionDTO = {
  id: string
  topic: string
  createdAt: string
  turns: TurnDTO[]
}

/** 会话列表项（首页最近学习）。 */
export type TurnSessionSummary = {
  id: string
  topic: string
  createdAt: string
  /** 回合总数，用于首页展示体量。 */
  turnCount: number
}

/** 从叶回合回溯到根的纯净上下文。 */
export type TurnContextDTO = {
  sessionId: string
  leafTurnId: string
  topic: string
  turns: TurnDTO[]
}

export type CreateTurnSessionRequest = {
  userContent: string
}

export type CreateTurnSessionResponse = {
  session: TurnSessionDTO
}

export type AppendTurnRequest = {
  parentId: string
  userContent: string
}

export type AppendTurnResponse = {
  turn: TurnDTO
}

export type ForkTurnRequest = {
  parentId: string
  userContent: string
}

export type ForkTurnResponse = {
  turn: TurnDTO
}

export type UpdateTurnRequest = {
  userContent?: string
  assistantContent?: string
}

export type UpdateTurnResponse = {
  turn: TurnDTO
}

export type GetTurnContextResponse = {
  context: TurnContextDTO
}

export type ListTurnSessionsResponse = {
  sessions: TurnSessionSummary[]
}

// ============================================================================
// 模型供应商设置 API 契约
//
// 供应商按方向（本地 / 云端）组织。云端的默认供应商为 DeepSeek。
// API Key 仅保存在服务端，对外接口对其脱敏，不返回明文。
// ============================================================================

/** 供应商方向：本地推理或云端 API。 */
export type ProviderKind = 'local' | 'cloud'

/** 供应商配置（对外 DTO，不含 API Key 明文）。 */
export type ProviderConfig = {
  id: string
  kind: ProviderKind
  label: string
  endpoint: string
  model: string
  /** API Key 是否已在服务端设置（云端供应商适用）。 */
  apiKeySet: boolean
  /** API Key 的脱敏片段（如 sk-****1234）；本地供应商为空。 */
  apiKeyMasked?: string
}

/** 当前生效供应商信息（用于前端高亮，不携带敏感字段）。 */
export type ActiveProvider = {
  id: string
  kind: ProviderKind
  label: string
}

/** 供应商设置整体快照。 */
export type ProviderSettingsDTO = {
  providers: ProviderConfig[]
  activeProviderId: string
  active: ActiveProvider
}

/** 更新单个供应商的字段；apiKey 为空字符串或省略时保持不变。 */
export type UpdateProviderRequest = {
  label?: string
  endpoint?: string
  model?: string
  /** 设置为 null 表示清除 Key；省略表示不修改。 */
  apiKey?: string | null
}

/** 设置当前生效供应商的请求。 */
export type SetActiveProviderRequest = {
  providerId: string
}

/** 连通性检测结果。 */
export type TestProviderResponse = {
  ok: boolean
  /** 失败原因或成功提示。 */
  message: string
}
