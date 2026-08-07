// 未配置模型时的占位网关：明确报错，避免静默失败。
import type { ModelGateway } from './modelGateway.ts'

export const noopGateway: ModelGateway = {
  complete: () =>
    Promise.reject(new Error('未配置模型供应商（请在设置中选择并配置）')),
  summarize: () => Promise.resolve('（模型未配置）'),
  testConnection: () =>
    Promise.resolve({
      ok: false,
      message: '未配置模型供应商',
    }),
}
