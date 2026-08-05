import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SerializedBlob } from './contentStore.ts'
import type {
  BranchRecord,
  SessionDump,
  StoredMessage,
} from './domain.ts'
import type { LearningNode } from '../../shared/contracts.ts'

/**
 * 追加式事件日志 + 定期快照持久化。
 *
 * 每个会话维护两个文件：
 * - `<id>.journal.jsonl`：追加式变更事件日志（每行一个 JSON 事件）
 * - `<id>.session.json`：定期生成的压缩快照（复用 SessionDump）
 *
 * 写路径：每次变更追加一条事件到日志（O(1)），达到条数或空闲时长阈值时，
 * 才序列化一次全量快照并截断日志。启动恢复 = 加载最近快照 + 重放其后日志。
 *
 * 事件设计为自包含（携带重建所需的数据），因此重放是纯数据应用，
 * 不触发任何模型调用或副作用。
 */
export type JournalEvent =
  | {
      type: 'message_appended'
      sessionId: string
      message: StoredMessage
      content: string
      createdAt: string
      branchHeadMessageId: string
    }
  | {
      type: 'branch_created'
      sessionId: string
      node: LearningNode
      branch: BranchRecord
      initialMessage?: StoredMessage
      initialContent?: string
      createdAt: string
    }
  | {
      type: 'branch_merged'
      sessionId: string
      sourceNode: LearningNode
      parentNode: LearningNode
      message: StoredMessage
      content: string
      createdAt: string
    }
  | {
      type: 'node_updated'
      sessionId: string
      node: LearningNode
      branch: BranchRecord
    }
  | {
      type: 'node_unlocked'
      sessionId: string
      node: LearningNode
    }

export type SessionPersistor = {
  /** 追加变更事件；达到快照阈值时内部触发压缩性快照。snapshot 为惰性求值的完整快照。 */
  append(
    sessionId: string,
    events: JournalEvent[],
    snapshot: () => SessionDump,
  ): Promise<void>
  load(sessionId: string): Promise<SessionDump | null>
  listSessionIds(): Promise<string[]>
}

export type FilePersistorOptions = {
  /** 距离上次快照多少条事件后触发一次快照压缩（默认 30）。 */
  checkpointEventThreshold?: number
  /** 距离上次快照多少毫秒后，若有待持久化事件则触发快照压缩（默认 5 分钟）。 */
  checkpointIdleMs?: number
}

const DEFAULT_EVENT_THRESHOLD = 30
const DEFAULT_IDLE_MS = 5 * 60 * 1000

const escapeId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, '_')
const journalFileFor = (sessionId: string, dataDir: string) =>
  path.join(dataDir, `${escapeId(sessionId)}.journal.jsonl`)
const checkpointFileFor = (sessionId: string, dataDir: string) =>
  path.join(dataDir, `${escapeId(sessionId)}.session.json`)

/**
 * 基于文件系统的追加式事件日志 + 定期快照持久化。
 * 数据目录不存在时自动创建；快照写入先写临时文件再重命名，避免半截文件。
 */
export function createJournaledSessionPersistor(
  dataDir: string,
  options: FilePersistorOptions = {},
): SessionPersistor {
  const eventThreshold =
    options.checkpointEventThreshold ?? DEFAULT_EVENT_THRESHOLD
  const idleMs = options.checkpointIdleMs ?? DEFAULT_IDLE_MS
  // 每个会话自上次快照以来累积的事件数。
  const pendingSinceCheckpoint = new Map<string, number>()
  // 每个会话最近一次写入（快照或日志追加）的时间。
  const lastWriteAt = new Map<string, number>()
  // 已经建立过检查点/日志的会话。首次写入一律走快照，规避 createSession 的种子数据。
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
        // 压缩：写入全量快照并清空该会话的日志文件。
        await writeCheckpointAtomic(checkpointFileFor(sessionId, dataDir), snapshot())
        await writeFile(journalFileFor(sessionId, dataDir), '', 'utf8')
        pendingSinceCheckpoint.delete(sessionId)
      } else {
        // 追加：把事件逐行追加到日志，保证崩溃时已落盘的内容不丢失。
        const lines = events
          .map((event) => JSON.stringify({ seq: Date.now(), ...event }))
          .join('\n')
        await appendAtomic(journalFileFor(sessionId, dataDir), lines)
      }
      markWritten(sessionId)
    },

    async load(sessionId) {
      await mkdir(dataDir, { recursive: true })
      const checkpoint = await readCheckpoint(checkpointFileFor(sessionId, dataDir))
      if (!checkpoint) {
        // 首次写入即产生快照，因此无快照说明会话不存在或未完整落盘。
        return null
      }
      const journalLines = await readJournal(journalFileFor(sessionId, dataDir))
      if (journalLines.length === 0) {
        return checkpoint
      }
      return applyEvents(checkpoint, journalLines)
    },

    async listSessionIds() {
      try {
        const entries = await readdir(dataDir)
        const ids = new Set<string>()
        for (const name of entries) {
          const journalMatch = name.match(/\.journal\.jsonl$/)
          const checkpointMatch = name.match(/\.session\.json$/)
          if (journalMatch) {
            ids.add(name.slice(0, -'.journal.jsonl'.length))
          } else if (checkpointMatch) {
            ids.add(name.slice(0, -'.session.json'.length))
          }
        }
        // 只返回不含扩展名的原始 id。
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
export function createFileSessionPersistor(
  dataDir: string,
): SessionPersistor {
  return {
    ...createJournaledSessionPersistor(dataDir, {
      checkpointEventThreshold: 0,
      checkpointIdleMs: 0,
    }),
  }
}

async function writeCheckpointAtomic(file: string, dump: SessionDump) {
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(dump, null, 2), 'utf8')
  await rename(temp, file)
}

async function appendAtomic(file: string, lines: string) {
  // 使用追加写入文件句柄。node 默认 append 写入不是原子追加多行，但
  // 这里每批事件来自单次 mutation，天然有序；配合 fsync 保证落盘。
  const { open } = await import('node:fs/promises')
  const handle = await open(file, 'a')
  try {
    await handle.writeFile(lines.length ? `${lines}\n` : '', 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readCheckpoint(file: string): Promise<SessionDump | null> {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as SessionDump
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

/**
 * 将快照 + 事件日志重放为最新会话快照。事件自包含，仅做数据合并，无副作用。
 * 事件按出现顺序应用；若事件缺失（如快照已覆盖）则幂等跳过。
 */
export function applyEvents(
  dump: SessionDump,
  lines: unknown[],
): SessionDump {
  const nodes = dump.nodes ? [...dump.nodes] : []
  const branches = dump.branches ? [...dump.branches] : []
  const messages = dump.messages ? [...dump.messages] : []
  const contentBlobs: SerializedBlob[] = dump.blobs ? [...dump.blobs] : []

  for (const raw of lines) {
    const event = deserializeEvent(raw)
    if (!event) {
      continue
    }
    switch (event.type) {
      case 'message_appended': {
        if (!messages.some((m) => m.id === event.message.id)) {
          upsert(
            contentBlobs,
            event.message.contentHash,
            event.content,
          )
          messages.push(event.message)
        }
        const branch = branches.find((b) => b.id === event.message.branchId)
        if (branch) {
          branch.headMessageId = event.branchHeadMessageId
        }
        break
      }
      case 'branch_created': {
        if (!nodes.some((n) => n.id === event.node.id)) {
          nodes.push(event.node)
        }
        if (!branches.some((b) => b.id === event.branch.id)) {
          branches.push(event.branch)
        }
        const initialMessage = event.initialMessage
        if (
          initialMessage &&
          !messages.some((m) => m.id === initialMessage.id)
        ) {
          upsert(contentBlobs, initialMessage.contentHash, event.initialContent ?? '')
          messages.push(initialMessage)
        }
        break
      }
      case 'branch_merged': {
        replaceNode(nodes, event.sourceNode)
        replaceNode(nodes, event.parentNode)
        if (!messages.some((m) => m.id === event.message.id)) {
          upsert(
            contentBlobs,
            event.message.contentHash,
            event.content,
          )
          messages.push(event.message)
        }
        break
      }
      case 'node_updated': {
        replaceNode(nodes, event.node)
        const branch = branches.find((b) => b.id === event.branch.id)
        if (branch) {
          branch.contextMode = event.branch.contextMode
          branch.headMessageId = event.branch.headMessageId
        }
        break
      }
      case 'node_unlocked': {
        replaceNode(nodes, event.node)
        break
      }
    }
  }

  sortByCreatedAt(messages)
  return { ...dump, nodes, branches, messages, blobs: contentBlobs }
}

function upsert(
  blobs: SerializedBlob[],
  hash: string,
  content: string,
) {
  const existing = blobs.find((b) => b.hash === hash)
  if (existing) {
    existing.referenceCount += 1
  } else {
    blobs.push({ hash, content, referenceCount: 1 })
  }
}

function replaceNode(nodes: LearningNode[], node: LearningNode) {
  const index = nodes.findIndex((n) => n.id === node.id)
  if (index >= 0) {
    nodes[index] = node
  } else {
    nodes.push(node)
  }
}

function sortByCreatedAt(messages: StoredMessage[]) {
  // 保留文件内顺序，message_appended 事件天然按时间追加，这里不做重排。
  void messages
}

/** 解析并校验一行事件；遇到损坏行返回 null（向后截断容错）。 */
function deserializeEvent(raw: unknown): JournalEvent | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return null
  }
  return raw as JournalEvent
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
