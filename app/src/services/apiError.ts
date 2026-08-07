// 共享的 API 错误类型：网络错误、后端业务错误、响应解析失败统一封装。

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
