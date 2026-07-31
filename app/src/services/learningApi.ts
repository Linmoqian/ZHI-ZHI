import type {
  ContextMode,
  CreateBranchResponse,
  CreateSessionResponse,
  MergeBranchResponse,
  NodeStatus,
  SendMessageResponse,
  UpdateNodeResponse,
} from '../../shared/contracts'
import type { CanvasPosition } from '../types'

export class LearningApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'LearningApiError'
    this.status = status
    this.code = code
  }
}

export const learningApi = {
  createSession(topic: string) {
    return request<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    })
  },

  createBranch(
    sessionId: string,
    sourceNodeId: string,
    contextMode: ContextMode,
  ) {
    return request<CreateBranchResponse>(
      `/api/sessions/${sessionId}/nodes/${sourceNodeId}/branches`,
      {
        method: 'POST',
        body: JSON.stringify({ contextMode }),
      },
    )
  },

  sendMessage(sessionId: string, nodeId: string, content: string) {
    return request<SendMessageResponse>(
      `/api/sessions/${sessionId}/nodes/${nodeId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
    )
  },

  updateNode(
    sessionId: string,
    nodeId: string,
    input: {
      status?: NodeStatus
      contextMode?: ContextMode
      position?: CanvasPosition
    },
  ) {
    return request<UpdateNodeResponse>(
      `/api/sessions/${sessionId}/nodes/${nodeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    )
  },

  mergeBranch(sessionId: string, nodeId: string) {
    return request<MergeBranchResponse>(
      `/api/sessions/${sessionId}/nodes/${nodeId}/merge`,
      { method: 'POST' },
    )
  },
}

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
