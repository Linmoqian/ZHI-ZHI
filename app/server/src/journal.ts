import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SessionDump } from './domain.ts'

/**
 * 会话持久化接口：将一次会话的最新完整快照写入持久层。
 * 项目采用按会话一个 JSON 文件的方式，每个 mutation 后覆盖写入最新快照，
 * 不引入数据库依赖，进程重启后可通过快照恢复。
 */
export type SessionPersistor = {
  persist(session: SessionDump): Promise<void>
  load(sessionId: string): Promise<SessionDump | null>
  listSessionIds(): Promise<string[]>
}

/**
 * 基于文件系统的会话快照持久化。
 * dataDir 不存在时会自动创建；写入先写临时文件再重命名，避免半截文件。
 */
export function createFileSessionPersistor(
  dataDir: string,
): SessionPersistor {
  const escapeId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, '_')
  const fileFor = (sessionId: string) =>
    path.join(dataDir, `${escapeId(sessionId)}.session.json`)

  return {
    async persist(session) {
      await mkdir(dataDir, { recursive: true })
      const file = fileFor(session.id)
      const temp = `${file}.tmp`
      const payload = JSON.stringify(session, null, 2)
      await writeFile(temp, payload, 'utf8')
      await rename(temp, file)
    },

    async load(sessionId) {
      try {
        const raw = await readFile(fileFor(sessionId), 'utf8')
        return JSON.parse(raw) as SessionDump
      } catch (error) {
        if (isEnoent(error)) {
          return null
        }
        throw error
      }
    },

    async listSessionIds() {
      try {
        const entries = await readdir(dataDir)
        return entries
          .filter((name) => name.endsWith('.session.json'))
          .map((name) => name.slice(0, -'.session.json'.length))
          .filter((id) => !id.includes('.'))
      } catch (error) {
        if (isEnoent(error)) {
          return []
        }
        throw error
      }
    },
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
