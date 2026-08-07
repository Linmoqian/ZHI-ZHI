// 回合树前端 API 客户端。
//
// 对应后端 /api/turn-sessions 路由组。一个回合 = 一次用户输入 + 一次模型输出；
// 回合间通过 parentId 形成树，地图 = 树本身。详见 docs/回合树重构.md。

import type {
  AppendTurnResponse,
  CreateTurnSessionResponse,
  GetTurnContextResponse,
  ListTurnSessionsResponse,
  TurnSessionDTO,
  UpdateTurnResponse,
} from '../../shared/contracts'
import { LearningApiError } from './apiError'

async function request<T extends object>(path: string, init: RequestInit) {
  let response: Response

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
  } catch {
    throw new LearningApiError(
      0,
      'NETWORK_ERROR',
      '无法连接知枝后端，请确认开发服务已启动',
    )
  }

  let body: T | { error?: { code?: string; message?: string } }

  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new LearningApiError(
      response.status,
      'INVALID_RESPONSE',
      '后端返回了无法解析的响应',
    )
  }

  if (!response.ok) {
    const error = 'error' in body ? body.error : undefined
    throw new LearningApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? '后端请求失败',
    )
  }

  return body as T
}

export const turnApi = {
  /** 创建会话（根回合）。 */
  createSession(userContent: string) {
    return request<CreateTurnSessionResponse>('/api/turn-sessions', {
      method: 'POST',
      body: JSON.stringify({ userContent }),
    })
  },

  /** 列举所有会话（首页最近学习）。 */
  listSessions() {
    return request<ListTurnSessionsResponse>('/api/turn-sessions', {
      method: 'GET',
    })
  },

  /** 获取完整会话（含整棵回合树）。 */
  getSession(sessionId: string) {
    return request<{ session: TurnSessionDTO }>(
      `/api/turn-sessions/${sessionId}`,
      { method: 'GET' },
    )
  },

  /** 追加回合（生长）。 */
  appendTurn(sessionId: string, parentId: string, userContent: string) {
    return request<AppendTurnResponse>(
      `/api/turn-sessions/${sessionId}/turns`,
      {
        method: 'POST',
        body: JSON.stringify({ parentId, userContent }),
      },
    )
  },

  /** 分叉回合（从指定回合长出新子回合）。 */
  forkTurn(sessionId: string, turnId: string, userContent: string) {
    return request<AppendTurnResponse>(
      `/api/turn-sessions/${sessionId}/turns/${turnId}/fork`,
      {
        method: 'POST',
        body: JSON.stringify({ userContent }),
      },
    )
  },

  /** 编辑回合内容。 */
  updateTurn(
    sessionId: string,
    turnId: string,
    patch: { userContent?: string; assistantContent?: string },
  ) {
    return request<UpdateTurnResponse>(
      `/api/turn-sessions/${sessionId}/turns/${turnId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    )
  },

  /** 获取叶回合的纯净上下文（根到叶路径）。 */
  getContext(sessionId: string, turnId: string) {
    return request<GetTurnContextResponse>(
      `/api/turn-sessions/${sessionId}/turns/${turnId}/context`,
      { method: 'GET' },
    )
  },
}
