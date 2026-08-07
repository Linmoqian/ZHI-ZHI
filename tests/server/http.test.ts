import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type {
  AppendTurnResponse,
  CreateTurnSessionResponse,
  GetTurnContextResponse,
  ListTurnSessionsResponse,
} from '../../app/shared/contracts.ts'
import { createApiHandler } from '../../app/server/src/http.ts'
import { TurnStoreRegistry } from '../../app/server/src/turnStoreRegistry.ts'
import { createFakeGateway } from './testGateway.ts'

test('回合树：创建会话返回根回合，列表可见', async () => {
  await withTurnApi(async (base) => {
    const { body } = await postJson<CreateTurnSessionResponse>(
      `${base}/api/turn-sessions`,
      { userContent: '什么是注意力机制？' },
    )
    assert.equal(body.session.turns.length, 1)
    assert.equal(body.session.turns[0].parentId, null)
    assert.equal(body.session.topic, '什么是注意力机制？')

    const listRes = await fetch(`${base}/api/turn-sessions`)
    const listBody = (await listRes.json()) as ListTurnSessionsResponse
    assert.equal(listBody.sessions.length, 1)
    assert.equal(listBody.sessions[0].topic, '什么是注意力机制？')
    assert.equal(listBody.sessions[0].turnCount, 1)
  })
})

test('回合树：追加回合生长，上下文为根到叶路径', async () => {
  await withTurnApi(async (base) => {
    const createBody = await postJson<CreateTurnSessionResponse>(
      `${base}/api/turn-sessions`,
      { userContent: '根问题' },
    )
    const sid = createBody.body.session.id
    const rootId = createBody.body.session.turns[0].id

    const appendBody = await postJson<AppendTurnResponse>(
      `${base}/api/turn-sessions/${sid}/turns`,
      { parentId: rootId, userContent: '跟进问题' },
    )
    assert.equal(appendBody.body.turn.parentId, rootId)

    const ctxRes = await fetch(
      `${base}/api/turn-sessions/${sid}/turns/${appendBody.body.turn.id}/context`,
    )
    const ctxBody = (await ctxRes.json()) as GetTurnContextResponse
    assert.equal(ctxBody.context.turns.length, 2)
    assert.equal(ctxBody.context.turns[1].userContent, '跟进问题')
  })
})

test('回合树：分叉后两条支线互不可见', async () => {
  await withTurnApi(async (base) => {
    const createBody = await postJson<CreateTurnSessionResponse>(
      `${base}/api/turn-sessions`,
      { userContent: '根问题' },
    )
    const sid = createBody.body.session.id
    const rootId = createBody.body.session.turns[0].id

    const aBody = await postJson<AppendTurnResponse>(
      `${base}/api/turn-sessions/${sid}/turns`,
      { parentId: rootId, userContent: '支线 A 私有内容 314159' },
    )
    const bBody = await postJson<AppendTurnResponse>(
      `${base}/api/turn-sessions/${sid}/turns`,
      { parentId: rootId, userContent: '支线 B 私有内容 271828' },
    )

    const ctxA = (await (
      await fetch(
        `${base}/api/turn-sessions/${sid}/turns/${aBody.body.turn.id}/context`,
      )
    ).json()) as GetTurnContextResponse
    const ctxB = (await (
      await fetch(
        `${base}/api/turn-sessions/${sid}/turns/${bBody.body.turn.id}/context`,
      )
    ).json()) as GetTurnContextResponse

    assert.ok(
      ctxA.context.turns.every(
        (t) => !t.userContent.includes('支线 B 私有内容 271828'),
      ),
    )
    assert.ok(
      ctxB.context.turns.every(
        (t) => !t.userContent.includes('支线 A 私有内容 314159'),
      ),
    )
  })
})

test('回合树：fork 路由从指定回合分叉出新子回合', async () => {
  await withTurnApi(async (base) => {
    const createBody = await postJson<CreateTurnSessionResponse>(
      `${base}/api/turn-sessions`,
      { userContent: '根问题' },
    )
    const sid = createBody.body.session.id
    const rootId = createBody.body.session.turns[0].id

    const forkBody = await postJson<AppendTurnResponse>(
      `${base}/api/turn-sessions/${sid}/turns/${rootId}/fork`,
      { userContent: '分叉追问' },
    )
    assert.equal(forkBody.body.turn.parentId, rootId)
    assert.notEqual(forkBody.body.turn.id, rootId)
  })
})

test('回合树：PATCH 编辑回合内容', async () => {
  await withTurnApi(async (base) => {
    const createBody = await postJson<CreateTurnSessionResponse>(
      `${base}/api/turn-sessions`,
      { userContent: '原始问题' },
    )
    const sid = createBody.body.session.id
    const rootId = createBody.body.session.turns[0].id

    const res = await fetch(
      `${base}/api/turn-sessions/${sid}/turns/${rootId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: '修改后的问题' }),
      },
    )
    const patchBody = (await res.json()) as AppendTurnResponse
    assert.equal(patchBody.turn.userContent, '修改后的问题')
  })
})

test('回合树：空用户输入返回 400', async () => {
  await withTurnApi(async (base) => {
    const { response, body } = await postJson<{
      error: { code: string }
    }>(`${base}/api/turn-sessions`, { userContent: '   ' })
    assert.equal(response.status, 400)
    assert.equal(body.error.code, 'INVALID_INPUT')
  })
})

async function withTurnApi(run: (baseUrl: string) => Promise<void>) {
  const registry = new TurnStoreRegistry({
    modelGateway: createFakeGateway(),
  })
  const server = createServer(createApiHandler(registry))
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    response,
    body: (await response.json()) as T,
  }
}
