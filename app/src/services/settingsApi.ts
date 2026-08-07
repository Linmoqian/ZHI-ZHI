// 供应商设置前端 API 客户端。
// 对应后端 /api/settings/providers 路由组。API Key 仅在此处写入服务端，
// 前端不缓存明文，仅持有 GET 返回的脱敏摘要。

import type {
  ProviderSettingsDTO,
  TestProviderResponse,
} from '../../shared/contracts'
import { LearningApiError } from './apiError'
import { API_BASE_URL } from '../lib/apiConfig'

async function request<T extends object>(path: string, init: RequestInit) {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
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

export const settingsApi = {
  /** 获取全部供应商与当前激活项（API Key 脱敏）。 */
  listProviders() {
    return request<ProviderSettingsDTO>('/api/settings/providers', {
      method: 'GET',
    })
  },

  /** 更新单个供应商字段；apiKey 为空串表示不变，null 表示清除。 */
  updateProvider(
    providerId: string,
    patch: {
      label?: string
      endpoint?: string
      model?: string
      apiKey?: string | null
    },
  ) {
    return request<ProviderSettingsDTO>(
      `/api/settings/providers/${providerId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    )
  },

  /** 设为生效供应商。 */
  setActive(providerId: string) {
    return request<ProviderSettingsDTO>('/api/settings/providers/active', {
      method: 'PUT',
      body: JSON.stringify({ providerId }),
    })
  },

  /** 测试某供应商连通性。 */
  testConnection(providerId: string) {
    return request<TestProviderResponse>(
      `/api/settings/providers/${providerId}/test`,
      { method: 'POST' },
    )
  },
}
