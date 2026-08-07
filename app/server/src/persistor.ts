// 会话持久化接口。
//
// SQLite 实现以事务原子地写入会话的完整快照（sessions + turns + content_blobs），
// 替换旧的事件日志 + 定期快照双机制。领域层只需在变更后调用 save。

import type { TurnSessionDump } from './domain.ts'

export type TurnPersistor = {
  /** 以事务覆写会话完整快照；失败时回滚，不残留半截数据。 */
  save(sessionId: string, dump: TurnSessionDump): Promise<void>
  /** 读取会话快照；不存在时返回 null。 */
  load(sessionId: string): Promise<TurnSessionDump | null>
  /** 列出所有会话 id（用于恢复与首页列表）。 */
  listSessionIds(): Promise<string[]>
  /** 删除指定会话（级联删除回合与内容记录）。 */
  deleteSession(sessionId: string): Promise<void>
}
