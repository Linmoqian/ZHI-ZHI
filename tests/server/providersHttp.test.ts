import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import test from 'node:test'
import type { ProviderSettingsDTO } from '../../app/shared/contracts.ts'
import { createApiHandler } from '../../app/server/src/http.ts'
import { openDatabase } from '../../app/server/src/db.ts'
import { TurnStoreRegistry } from '../../app/server/src/turnStoreRegistry.ts'

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhizhi-http-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function withProviderApi(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  return withTempDir(async (dataDir) => {
    const db = openDatabase(dataDir)
    const registry = new TurnStoreRegistry({ db })
    registry.loadProviderSettings()
    const server = createServer(createApiHandler(registry))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as AddressInfo
    try {
      await run(`http://127.0.0.1:${address.port}`)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
      db.close()
    }
  })
}

test('供应商：GET 返回两个方向且含云端 DeepSeek', async () => {
  await withProviderApi(async (base) => {
    const res = await fetch(`${base}/api/settings/providers`)
    const body = (await res.json()) as ProviderSettingsDTO
    assert.equal(res.status, 200)
    assert.equal(body.providers.length, 2)
    const cloud = body.providers.find((p) => p.kind === 'cloud')!
    assert.equal(cloud.label, 'DeepSeek')
    assert.equal(cloud.apiKeySet, false)
  })
})

test('供应商：PATCH 更新云端 Key 后脱敏回显', async () => {
  await withProviderApi(async (base) => {
    const initial = (await (
      await fetch(`${base}/api/settings/providers`)
    ).json()) as ProviderSettingsDTO
    const cloud = initial.providers.find((p) => p.kind === 'cloud')!

    const res = await fetch(
      `${base}/api/settings/providers/${cloud.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-patch-abcdef1234' }),
      },
    )
    const body = (await res.json()) as ProviderSettingsDTO
    const updatedCloud = body.providers.find((p) => p.id === cloud.id)!
    assert.equal(updatedCloud.apiKeySet, true)
    assert.match(updatedCloud.apiKeyMasked ?? '', /sk-\*\*\*\*1234/)
  })
})

test('供应商：设为生效切换激活方向', async () => {
  await withProviderApi(async (base) => {
    const initial = (await (
      await fetch(`${base}/api/settings/providers`)
    ).json()) as ProviderSettingsDTO
    const cloud = initial.providers.find((p) => p.kind === 'cloud')!

    const res = await fetch(`${base}/api/settings/providers/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: cloud.id }),
    })
    const body = (await res.json()) as ProviderSettingsDTO
    assert.equal(body.activeProviderId, cloud.id)
    assert.equal(body.active.kind, 'cloud')
  })
})

test('供应商：PATCH 不存在的供应商返回 404', async () => {
  await withProviderApi(async (base) => {
    const res = await fetch(`${base}/api/settings/providers/no-such-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'x' }),
    })
    assert.equal(res.status, 404)
  })
})
