import type {
  ModelGateway,
  ModelInput,
} from '../../app/server/src/modelGateway.ts'

/**
 * 测试用模型网关：不访问网络，始终返回固定回复。
 * 用于隔离模型依赖，聚焦业务逻辑验证。
 */
export function createFakeGateway(reply = '测试回复'): ModelGateway {
  return {
    complete(_input: ModelInput): Promise<string> {
      return Promise.resolve(reply)
    },
    summarize(_content: string): Promise<string> {
      return Promise.resolve(reply)
    },
    testConnection(): Promise<
      { ok: true; message: string } | { ok: false; message: string }
    > {
      return Promise.resolve({ ok: true, message: '测试网关连通' })
    },
  }
}
