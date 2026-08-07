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
