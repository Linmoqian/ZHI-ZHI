import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { Database } from 'better-sqlite3'
import path from 'node:path'
import test from 'node:test'
import { openDatabase } from '../../app/server/src/db.ts'
import {
  defaultStoredSettings,
  loadProviderSettingsFromDb,
  maskApiKey,
  saveProviderSettingsToDb,
  toProviderDTO,
  toSettingsDTO,
} from '../../app/server/src/providerConfig.ts'

async function withTempDir<T>(
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhizhi-providers-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('providerConfig：默认配置含本地 Ollama 与云端 DeepSeek，激活本地', async () => {
  await withTempDir(async (dir) => {
    const db = openDatabase(dir)
    const settings = loadProviderSettingsFromDb(db)
    assert.equal(settings.providers.length, 2)
    assert.ok(settings.providers.some((p) => p.kind === 'local'))
    assert.ok(settings.providers.some((p) => p.kind === 'cloud'))
    assert.equal(settings.activeProviderId, settings.providers[0].id)
    db.close()
  })
})

test('providerConfig：保存后再加载保持一致', async () => {
  await withTempDir(async (dir) => {
    const db = openDatabase(dir)
    const first = loadProviderSettingsFromDb(db)
    const cloud = first.providers.find((p) => p.kind === 'cloud')!
    cloud.apiKey = 'sk-saved-1234567890'
    first.activeProviderId = cloud.id
    saveProviderSettingsToDb(db, first)

    const reloaded = loadProviderSettingsFromDb(db)
    const reloadedCloud = reloaded.providers.find(
      (p) => p.kind === 'cloud',
    )!
    assert.equal(reloadedCloud.apiKey, 'sk-saved-1234567890')
    assert.equal(reloaded.activeProviderId, cloud.id)
    db.close()
  })
})

test('providerConfig：DTO 对 API Key 脱敏且不返回明文', () => {
  const settings = defaultStoredSettings()
  const cloud = settings.providers.find((p) => p.kind === 'cloud')!
  cloud.apiKey = 'sk-abcdefghij1234'
  const dto = toProviderDTO(cloud)
  assert.equal(dto.apiKeySet, true)
  assert.match(dto.apiKeyMasked ?? '', /sk-\*\*\*\*1234/)
  assert.ok(!JSON.stringify(dto).includes('abcdefghij'))
})

test('providerConfig：本地供应商 DTO 不暴露 Key 字段', () => {
  const settings = defaultStoredSettings()
  const local = settings.providers.find((p) => p.kind === 'local')!
  const dto = toProviderDTO(local)
  assert.equal(dto.apiKeyMasked, undefined)
  assert.equal(dto.apiKeySet, false)
})

test('providerConfig：maskApiKey 对短 Key 返回空串', () => {
  assert.equal(maskApiKey('short'), '')
  assert.equal(maskApiKey(''), '')
})

test('providerConfig：toSettingsDTO 附带 active 摘要', () => {
  const settings = defaultStoredSettings()
  const dto = toSettingsDTO(settings)
  assert.equal(dto.active.id, settings.activeProviderId)
  assert.equal(dto.active.kind, 'local')
})

test('providerConfig：环境变量覆盖 DeepSeek Key 与 Ollama 端点', async () => {
  process.env.ZHIZHI_DEEPSEEK_API_KEY = 'sk-env-override-9999'
  process.env.ZHIZHI_OLLAMA_ENDPOINT = 'http://10.0.0.1:11434'
  try {
    await withTempDir(async (dir) => {
      const db = openDatabase(dir)
      const settings = loadProviderSettingsFromDb(db)
      const cloud = settings.providers.find(
        (p) => p.id === 'provider-cloud-deepseek',
      )!
      const local = settings.providers.find(
        (p) => p.id === 'provider-local-ollama',
      )!
      assert.equal(cloud.apiKey, 'sk-env-override-9999')
      assert.equal(local.endpoint, 'http://10.0.0.1:11434')
      db.close()
    })
  } finally {
    delete process.env.ZHIZHI_DEEPSEEK_API_KEY
    delete process.env.ZHIZHI_OLLAMA_ENDPOINT
  }
})

test('providerConfig：empty db 加载回退内置默认', async () => {
  await withTempDir(async (dir) => {
    const db = openDatabase(dir)
    const settings = loadProviderSettingsFromDb(db)
    assert.equal(settings.providers.length, 2)
    // 空库时积极激活本地
    assert.equal(settings.activeProviderId, settings.providers[0].id)
    db.close()
  })
})

test('providerConfig：重复保存覆盖而非累积', async () => {
  await withTempDir(async (dir) => {
    const db = openDatabase(dir)
    const first = loadProviderSettingsFromDb(db)
    first.providers.find((p) => p.kind === 'cloud')!.apiKey = 'sk-v1'
    saveProviderSettingsToDb(db, first)
    const second = loadProviderSettingsFromDb(db)
    const cloud = second.providers.find((p) => p.kind === 'cloud')!
    cloud.apiKey = 'sk-v2'
    second.activeProviderId = cloud.id
    saveProviderSettingsToDb(db, second)

    const loaded = loadProviderSettingsFromDb(db)
    assert.equal(loaded.providers.length, 2)
    assert.equal(
      loaded.providers.find((p) => p.kind === 'cloud')!.apiKey,
      'sk-v2',
    )
    assert.equal(loaded.activeProviderId, cloud.id)
    db.close()
  })
})
