import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { Database } from 'better-sqlite3'
import path from 'node:path'
import test from 'node:test'
import { openDatabase } from '../../app/server/src/db.ts'
import { TurnStoreRegistry } from '../../app/server/src/turnStoreRegistry.ts'
import { DB_FILE_NAME } from '../../app/server/src/db.ts'

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhizhi-persist-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('供应商配置持久化：重启后恢复 Key 与生效方向', async () => {
  await withTempDir(async (dataDir) => {
    const db1 = openDatabase(dataDir)
    const reg1 = new TurnStoreRegistry({ db: db1 })
    reg1.loadProviderSettings()
    const cloud1 = reg1
      .getProviderSettings()
      .providers.find((p) => p.kind === 'cloud')!
    await reg1.updateProvider(cloud1.id, { apiKey: 'sk-persist-1234567890' })
    await reg1.setActiveProvider(cloud1.id)
    assert.equal(reg1.getProviderSettings().active.kind, 'cloud')
    db1.close()

    // 阶段2：新实例（模拟重启）从同一文件打开
    const db2 = openDatabase(dataDir)
    const reg2 = new TurnStoreRegistry({ db: db2 })
    reg2.loadProviderSettings()
    const restored = reg2.getProviderSettings()
    const cloud2 = restored.providers.find((p) => p.kind === 'cloud')!
    assert.equal(restored.activeProviderId, cloud1.id)
    assert.equal(restored.active.kind, 'cloud')
    assert.equal(cloud2.apiKeySet, true)
    assert.match(cloud2.apiKeyMasked ?? '', /sk-\*\*\*\*7890/)
    db2.close()
  })
})

test('供应商配置持久化：数据写入 SQLite provider_settings 表', async () => {
  await withTempDir(async (dataDir) => {
    const db = openDatabase(dataDir)
    const reg = new TurnStoreRegistry({ db })
    reg.loadProviderSettings()
    const cloud = reg
      .getProviderSettings()
      .providers.find((p) => p.kind === 'cloud')!
    await reg.updateProvider(cloud.id, { apiKey: 'sk-disk-abcdef1234' })

    const row = db
      .prepare(`SELECT * FROM provider_settings WHERE kind = 'cloud'`)
      .get() as {
      id: string
      api_key: string
      is_active: number
    }
    assert.equal(row.api_key, 'sk-disk-abcdef1234')
    db.close()
  })
})

test('会话持久化：创建会话后重启可恢复', async () => {
  await withTempDir(async (dataDir) => {
    const { createFakeGateway } = await import('./testGateway.ts')

    const db1 = openDatabase(dataDir)
    const reg1 = new TurnStoreRegistry({
      db: db1,
      modelGateway: createFakeGateway('回复内容-ABC'),
    })
    reg1.loadProviderSettings()
    const store1 = await reg1.createSession('什么是注意力')
    await store1.persist()
    const sessionId = store1.id
    db1.close()

    // 重启：新实例从同一文件恢复
    const db2 = openDatabase(dataDir)
    const reg2 = new TurnStoreRegistry({
      db: db2,
      modelGateway: createFakeGateway(),
    })
    reg2.loadProviderSettings()
    const restored = await reg2.getSession(sessionId)
    const dto = reg2.toSessionDTO(restored)
    assert.equal(dto.turns.length, 1)
    assert.equal(dto.turns[0].userContent, '什么是注意力')
    assert.equal(dto.turns[0].assistantContent, '回复内容-ABC')
  })
})

test('数据库文件确实生成在 dataDir 下', async () => {
  await withTempDir(async (dataDir) => {
    const { readdir } = await import('node:fs/promises')
    const db = openDatabase(dataDir)
    db.close()
    const files = await readdir(dataDir)
    assert.ok(files.includes(DB_FILE_NAME), `缺少 ${DB_FILE_NAME}`)
  })
})
