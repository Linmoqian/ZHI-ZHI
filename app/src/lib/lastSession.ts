// 持久化「最后打开的会话 id」，使重新进入地图时能恢复上次的会话。
// 用 localStorage 存储，键名固定；读取失败（如隐私模式）时静默降级。

const STORAGE_KEY = 'zhizhi.lastSessionId'

/** 读取最后打开的会话 id；无记录或读取失败时返回 null。 */
export function loadLastSessionId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** 记录最后打开的会话 id；写入失败时静默忽略。 */
export function saveLastSessionId(sessionId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, sessionId)
  } catch {
    // 隐私模式或配额已满，忽略——不影响核心功能
  }
}

/** 清除记录（如会话被删除后）。 */
export function clearLastSessionId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}
