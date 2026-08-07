// SQLite 数据库连接与建表。
//
// 单文件嵌入式数据库，替换旧的文件型事件日志/快照持久化（turnJournal.ts）。
// - 会话（回合树）用 sessions / turns / content_blobs 三表存储
// - 供应商配置用 provider_settings 表存储
// - WAL 模式提升并发读；单连接由上层持有并复用（better-sqlite3 同步 API）

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export const DB_FILE_NAME = 'zhizhi.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_blobs (
  hash            TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  reference_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS turns (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id            TEXT REFERENCES turns(id) ON DELETE CASCADE,
  user_content_hash    TEXT NOT NULL REFERENCES content_blobs(hash),
  assistant_content_hash TEXT NOT NULL REFERENCES content_blobs(hash),
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);

CREATE TABLE IF NOT EXISTS provider_settings (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  label     TEXT NOT NULL,
  endpoint  TEXT NOT NULL,
  model     TEXT NOT NULL,
  api_key   TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0
);
`

/** 打开（或创建）数据库并初始化 schema；失败时抛出。 */
export function openDatabase(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true })
  const file = path.join(dataDir, DB_FILE_NAME)
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
