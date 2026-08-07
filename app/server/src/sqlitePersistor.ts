// 基于 SQLite 的会话持久化实现。
//
// 以事务原子地写入会话完整快照，替换旧的事件日志 + 快照双机制。
// content_blobs 表保存内容寻址映射（hash → 明文），turns 引用 hash，
// 相同内容在库内共享一份明文。

import type { Database } from 'better-sqlite3'
import type { SerializedBlob } from './contentStore.ts'
import type { TurnSessionDump } from './domain.ts'
import type { TurnPersistor } from './persistor.ts'

type TurnRow = {
  id: string
  parent_id: string | null
  user_content_hash: string
  assistant_content_hash: string
  created_at: string
}

type SessionRow = {
  id: string
  topic: string
  created_at: string
}

/**
 * 创建 SQLite 持久化器。使用方持有同一 better-sqlite3 连接。
 * 事务保证 save 是原子的；WAL 模式由 db.ts 开启。
 */
export function createSqlitePersistor(db: Database): TurnPersistor {
  const stmtSaveSession = db.prepare(
    `INSERT INTO sessions (id, topic, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET topic = excluded.topic`,
  )
  const stmtDeleteTurns = db.prepare(
    `DELETE FROM turns WHERE session_id = ?`,
  )
  const stmtUpsertBlob = db.prepare(
    `INSERT INTO content_blobs (hash, content, reference_count)
     VALUES (?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET content = excluded.content`,
  )
  const stmtInsertTurn = db.prepare(
    `INSERT INTO turns
       (id, session_id, parent_id, user_content_hash, assistant_content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const stmtSelectSession = db.prepare(
    `SELECT id, topic, created_at FROM sessions WHERE id = ?`,
  )
  const stmtSelectTurns = db.prepare(
    `SELECT id, parent_id, user_content_hash, assistant_content_hash, created_at
     FROM turns WHERE session_id = ?`,
  )
  const stmtSelectBlob = db.prepare(
    `SELECT content FROM content_blobs WHERE hash = ?`,
  )
  const stmtListSessions = db.prepare(`SELECT id FROM sessions`)
  const stmtDeleteSession = db.prepare(`DELETE FROM sessions WHERE id = ?`)

  return {
    save(sessionId, dump) {
      const saveTx = db.transaction(() => {
        stmtSaveSession.run(dump.id, dump.topic, dump.createdAt)
        stmtDeleteTurns.run(sessionId)

        // upsert 会话涉及的 blobs（保持内容寻址去重）
        for (const blob of dump.blobs) {
          stmtUpsertBlob.run(blob.hash, blob.content, blob.referenceCount)
        }

        for (const turn of dump.turns) {
          stmtInsertTurn.run(
            turn.id,
            sessionId,
            turn.parentId,
            turn.userContentHash,
            turn.assistantContentHash,
            turn.createdAt,
          )
        }
      })
      saveTx()
      return Promise.resolve()
    },

    load(sessionId) {
      const session = stmtSelectSession.get(sessionId) as
        | SessionRow
        | undefined
      if (!session) {
        return Promise.resolve(null)
      }

      const rows = stmtSelectTurns.all(sessionId) as TurnRow[]
      const { turns, blobs } = assembleDump(rows, (hash) => {
        const blob = stmtSelectBlob.get(hash) as
          | { content: string }
          | undefined
        return blob?.content ?? null
      })

      const dump: TurnSessionDump = {
        id: session.id,
        topic: session.topic,
        createdAt: session.created_at,
        turns,
        blobs,
      }
      return Promise.resolve(dump)
    },

    listSessionIds() {
      const rows = stmtListSessions.all() as SessionRow[]
      return Promise.resolve(rows.map((r) => r.id))
    },

    deleteSession(sessionId) {
      const deleteTx = db.transaction(() => {
        stmtDeleteSession.run(sessionId)
      })
      deleteTx()
      return Promise.resolve()
    },
  }
}

/** 从行组装 TurnSessionDump，并通过读取器还原明文与引用计数。 */
export function assembleDump(
  rows: TurnRow[],
  readBlob: (hash: string) => string | null,
): { turns: TurnSessionDump['turns']; blobs: SerializedBlob[] } {
  const turns = rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    userContentHash: r.user_content_hash,
    assistantContentHash: r.assistant_content_hash,
    createdAt: r.created_at,
  }))

  // 统计每个 hash 在本会话内的引用次数，作为 referenceCount。
  const countByHash = new Map<string, number>()
  const contentByHash = new Map<string, string>()
  for (const turn of turns) {
    for (const hash of [turn.userContentHash, turn.assistantContentHash]) {
      countByHash.set(hash, (countByHash.get(hash) ?? 0) + 1)
      if (!contentByHash.has(hash)) {
        const content = readBlob(hash)
        if (content !== null) {
          contentByHash.set(hash, content)
        }
      }
    }
  }

  const blobs: SerializedBlob[] = [...countByHash.entries()]
    .filter(([hash]) => contentByHash.has(hash))
    .map(([hash, count]) => ({
      hash,
      content: contentByHash.get(hash) as string,
      referenceCount: count,
    }))

  return { turns, blobs }
}
