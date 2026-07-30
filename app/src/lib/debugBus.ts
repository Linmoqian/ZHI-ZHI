export type DebugEventName =
  | 'view:change'
  | 'node:select'
  | 'node:create'
  | 'node:update'
  | 'node:merge'
  | 'message:send'

export function emitDebugEvent(
  name: DebugEventName,
  detail: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent('zhizhi:debug', {
      detail: {
        name,
        timestamp: new Date().toISOString(),
        ...detail,
      },
    }),
  )

  if (import.meta.env.DEV) {
    console.debug(`[知枝] ${name}`, detail)
  }
}
