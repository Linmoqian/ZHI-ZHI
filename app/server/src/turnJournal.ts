// 回合树持久化：追加式事件日志 + 定期快照。
//
// 每个会话维护两个文件：
// - `<id>.tjournal.jsonl`：追加式回合变更事件日志（每行一个 JSON 事件）
// - `<id>.tsession.json`：定期生成的压缩快照（复用 TurnSessionDump）
//
// 写路径：每次变更追加一条事件到日志（O(1)），达到条数或空闲时长阈值时，
// 才序列化一次全量快照并截断日志。启动恢复 = 加载最近快照 + 重放其后日志。
//
// 事件自包含（携带回合结构与内容），重放是纯数据应用，不触发模型调用或副作用。

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  SerializedBlob,
} from './contentStore.ts'
import type { TurnNode, TurnSessionDump } from './domain.ts'

/** 回合变更事件：回合模型下核心 mutation 只有两类。 */
export type TurnJournalEvent =
  | {
      type: 'turn_appended'
      sessionId: string
      /** 新增的回合（生长或分叉）。 */
      turn: SerializedTurn
      /** 用户输入原文。 */
      userContent: string
      /** 模型输出原文。 */
      assistantContent: string
      createdAt: string
    }
  | {
      type: 'turn_updated'
      sessionId: string
      /** 更新后的回合。 */
      turn: SerializedTurn
      /** 仅当 user 内容变更时携带新原文。 */
      userContent?: string
      /** 仅当 assistant 内容变更时携带新原文。 */
      assistantContent?: string
    }

/** 可序列化的回合（与 TurnNode 同构，独立声明以与持久化解耦）。 */
export type SerializedTurn = {
  id: string
  parentId: string | null
  userContentHash: string
  assistantContentHash: string
  createdAt: string
}

export type TurnPersistor = {
  /** 追加变更事件；达到快照阈值时内部触发压缩性快照。 */
  append(
    sessionId: string,
    events: TurnJournalEvent[],
    snapshot: () => TurnSessionDump,
  ): Promise<void>
  load(sessionId: string): Promise<TurnSessionDump | null>
  listSessionIds(): Promise<string[]>
}

export type TurnFilePersistorOptions = {
  /** 距离上次快照多少条事件后触发一次快照压缩（默认 30）。 */
  checkpointEventThreshold?: number
  /** 距离上次快照多少毫秒后，若有待持久化事件则触发快照压缩（默认 5 分钟）。 */
  checkpointIdleMs?: number
}

const DEFAULT_EVENT_THRESHOLD = 30
const DEFAULT_IDLE_MS = 5 * 60 * 1000

const escapeId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, '_')
const journalFileFor = (sessionId: string, dataDir: string) =>
  path.join(dataDir, `${escapeId(sessionId)}.tjournal.jsonl`)
const checkpointFileFor = (sessionId: string, dataDir: string) =>
  path.join(dataDir, `${escapeId(sessionId)}.tsession.json`)

/**
 * 基于文件系统的追加式事件日志 + 定期快照持久化（回合树版）。
 * 数据目录不存在时自动创建；快照写入先写临时文件再重命名，避免半截文件。
 */
export function createTurnJournaledPersistor(
  dataDir: string,
  options: TurnFilePersistorOptions = {},
): TurnPersistor {
  const eventThreshold =
    options.checkpointEventThreshold ?? DEFAULT_EVENT_THRESHOLD
  const idleMs = options.checkpointIdleMs ?? DEFAULT_IDLE_MS
  const pendingSinceCheckpoint = new Map<string, number>()
  const lastWriteAt = new Map<string, number>()
  // 首次写入一律走快照，规避 createSession 的根回合种子数据。
  const seenSessions = new Set<string>()

  const markWritten = (sessionId: string) => {
    lastWriteAt.set(sessionId, Date.now())
  }

  const shouldCheckpoint = (sessionId: string, pending: number): boolean => {
    if (pending >= eventThreshold) {
      return true
    }
    const last = lastWriteAt.get(sessionId)
    return last !== undefined && Date.now() - last >= idleMs && pending > 0
  }

  return {
    async append(sessionId, events, snapshot) {
      if (events.length === 0) {
        return
      }
      await mkdir(dataDir, { recursive: true })

      const isFirst = !seenSessions.has(sessionId)
      seenSessions.add(sessionId)
      const pending =
        (pendingSinceCheckpoint.get(sessionId) ?? 0) + events.length
      pendingSinceCheckpoint.set(sessionId, pending)

      if (isFirst || shouldCheckpoint(sessionId, pending)) {
        await writeCheckpointAtomic(
          checkpointFileFor(sessionId, dataDir),
          snapshot(),
        )
        await writeFile(journalFileFor(sessionId, dataDir), '', 'utf8')
        pendingSinceCheckpoint.delete(sessionId)
      } else {
        const lines = events
          .map((event) => JSON.stringify({ seq: Date.now(), ...event }))
          .join('\n')
        await appendAtomic(journalFileFor(sessionId, dataDir), lines)
      }
      markWritten(sessionId)
    },

    async load(sessionId) {
      await mkdir(dataDir, { recursive: true })
      const checkpoint = await readCheckpoint(
        checkpointFileFor(sessionId, dataDir),
      )
      if (!checkpoint) {
        return null
      }
      const journalLines = await readJournal(
        journalFileFor(sessionId, dataDir),
      )
      if (journalLines.length === 0) {
        return checkpoint
      }
      return applyTurnEvents(checkpoint, journalLines)
    },

    async listSessionIds() {
      try {
        const entries = await readdir(dataDir)
        const ids = new Set<string>()
        for (const name of entries) {
          const journalMatch = name.match(/\.tjournal\.jsonl$/)
          const checkpointMatch = name.match(/\.tsession\.json$/)
          if (journalMatch) {
            ids.add(name.slice(0, -'.tjournal.jsonl'.length))
          } else if (checkpointMatch) {
            ids.add(name.slice(0, -'.tsession.json'.length))
          }
        }
        return [...ids].filter((id) => !id.includes('.'))
      } catch (error) {
        if (isEnoent(error)) {
          return []
        }
        throw error
      }
    },
  }
}

/** 向下兼容的纯快照持久化：每次写全量快照，忽略事件。 */
export function createTurnFilePersistor(dataDir: string): TurnPersistor {
  return {
    ...createTurnJournaledPersistor(dataDir, {
      checkpointEventThreshold: 0,
      checkpointIdleMs: 0,
    }),
  }
}

/**
 * 将快照 + 事件日志重放为最新会话快照。事件自包含，仅做数据合并，无副作用。
 * 事件按出现顺序应用；若事件缺失（如快照已覆盖）则幂等跳过。
 */
export function applyTurnEvents(
  dump: TurnSessionDump,
  lines: unknown[],
): TurnSessionDump {
  const turns: TurnNode[] = dump.turns ? [...dump.turns] : []
  const contentBlobs: SerializedBlob[] = dump.blobs ? [...dump.blobs] : []

  for (const raw of lines) {
    const event = deserializeEvent(raw)
    if (!event) {
      continue
    }
    switch (event.type) {
      case 'turn_appended': {
        if (!turns.some((t) => t.id === event.turn.id)) {
          if (event.userContent) {
            upsert(contentBlobs, event.turn.userContentHash, event.userContent)
          }
          if (event.assistantContent) {
            upsert(
              contentBlobs,
              event.turn.assistantContentHash,
              event.assistantContent,
            )
          }
          turns.push(event.turn)
        }
        break
      }
      case 'turn_updated': {
        const index = turns.findIndex((t) => t.id === event.turn.id)
        if (index >= 0) {
          if (event.userContent) {
            upsert(
              contentBlobs,
              event.turn.userContentHash,
              event.userContent,
            )
          }
          if (event.assistantContent) {
            upsert(
              contentBlobs,
              event.turn.assistantContentHash,
              event.assistantContent,
            )
          }
          turns[index] = event.turn
        }
        break
      }
    }
  }

  return { ...dump, turns, blobs: contentBlobs }
}

function upsert(blobs: SerializedBlob[], hash: string, content: string) {
  const existing = blobs.find((b) => b.hash === hash)
  if (existing) {
    existing.referenceCount += 1
  } else {
    blobs.push({ hash, content, referenceCount: 1 })
  }
}

/** 解析并校验一行事件；遇到损坏行返回 null（向后截断容错）。 */
function deserializeEvent(raw: unknown): TurnJournalEvent | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return null
  }
  return raw as TurnJournalEvent
}

async function writeCheckpointAtomic(file: string, dump: TurnSessionDump) {
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(dump, null, 2), 'utf8')
  await rename(temp, file)
}

async function appendAtomic(file: string, lines: string) {
  const { open } = await import('node:fs/promises')
  const handle = await open(file, 'a')
  try {
    await handle.writeFile(lines.length ? `${lines}\n` : '', 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readCheckpoint(file: string): Promise<TurnSessionDump | null> {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as TurnSessionDump
  } catch (error) {
    if (isEnoent(error)) {
      return null
    }
    throw error
  }
}

async function readJournal(file: string): Promise<unknown[]> {
  try {
    const raw = await readFile(file, 'utf8')
    if (!raw.trim()) {
      return []
    }
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown)
  } catch (error) {
    if (isEnoent(error)) {
      return []
    }
    throw error
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}

// 静态分析辅助：确保 TurnNode 形参与 SerializedTurn 同构的转换点显式可见。
export function toSerializedTurn(turn: TurnNode): SerializedTurn {
  return {
    id: turn.id,
    parentId: turn.parentId,
    userContentHash: turn.userContentHash,
    assistantContentHash: turn.assistantContentHash,
    createdAt: turn.createdAt,
  }
}
