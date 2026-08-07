import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type {
  CreateBranchResponse,
  CreateSessionResponse,
  SendMessageResponse,
  UpdateNodeResponse,
} from '../../shared/contracts.ts'
import type {
  CreateTurnSessionResponse,
  AppendTurnResponse,
  GetTurnContextResponse,
  ListTurnSessionsResponse,
  TurnSessionDTO,
} from '../../shared/contracts.ts'
import { createApiHandler } from '../src/http.ts'
import { LearningStore } from '../src/learningStore.ts'
import { TurnStoreRegistry } from '../src/turnStoreRegistry.ts'
import { createFakeGateway } from './testGateway.ts'

test('HTTP 接口创建会话并拒绝空消息', async () => {
  await withApi(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/health`)
    assert.equal(healthResponse.status, 200)

    const sessionResponse = await postJson<CreateSessionResponse>(
      `${baseUrl}/api/sessions`,
      { topic: 'HTTP 后端验证' },
    )
    assert.equal(sessionResponse.response.status, 201)
    assert.equal(sessionResponse.body.session.nodes.length, 8)

    const emptyMessageResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionResponse.body.session.id}/nodes/self-attention/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '   ' }),
      },
    )
    assert.equal(emptyMessageResponse.status, 400)
    assert.deepEqual(await emptyMessageResponse.json(), {
      error: {
        code: 'INVALID_INPUT',
        message: '消息内容不能为空',
      },
    })

    const invalidModeResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionResponse.body.session.id}/nodes/self-attention/branches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextMode: 'leak-siblings' }),
      },
    )
    assert.equal(invalidModeResponse.status, 400)
    assert.deepEqual(await invalidModeResponse.json(), {
      error: {
        code: 'INVALID_CONTEXT_MODE',
        message: '上下文模式无效',
      },
    })
  })
})

test('HTTP 上下文接口不泄漏同级分支消息', async () => {
  await withApi(async (baseUrl) => {
    const sessionResult = await postJson<CreateSessionResponse>(
      `${baseUrl}/api/sessions`,
      { topic: 'HTTP 分支隔离验证' },
    )
    const sessionId = sessionResult.body.session.id
    const branchA = await postJson<CreateBranchResponse>(
      `${baseUrl}/api/sessions/${sessionId}/nodes/self-attention/branches`,
      { title: '接口分支 A', contextMode: 'inherit' },
    )
    const branchB = await postJson<CreateBranchResponse>(
      `${baseUrl}/api/sessions/${sessionId}/nodes/self-attention/branches`,
      { title: '接口分支 B', contextMode: 'inherit' },
    )

    await postJson<SendMessageResponse>(
      `${baseUrl}/api/sessions/${sessionId}/nodes/${branchA.body.node.id}/messages`,
      { content: 'HTTP A 分支私有消息 141421' },
    )

    const contextResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/nodes/${branchB.body.node.id}/context`,
    )
    const contextBody = (await contextResponse.json()) as {
      context: {
        messages: Array<{ branchId: string; content: string }>
      }
    }

    assert.equal(contextResponse.status, 200)
    assert.ok(
      contextBody.context.messages.every(
        (message) =>
          message.branchId !== branchA.body.node.id &&
          !message.content.includes('HTTP A 分支私有消息 141421'),
      ),
    )
  })
})

test('HTTP 会话列表接口返回真实创建的会话', async () => {
  await withApi(async (baseUrl) => {
    const emptyResponse = await fetch(`${baseUrl}/api/sessions`)
    assert.equal(emptyResponse.status, 200)
    assert.deepEqual(await emptyResponse.json(), { sessions: [] })

    const created = await postJson<CreateSessionResponse>(
      `${baseUrl}/api/sessions`,
      { topic: '列表接口会话' },
    )

    const listResponse = await fetch(`${baseUrl}/api/sessions`)
    const listBody = (await listResponse.json()) as {
      sessions: Array<{ id: string; topic: string }>
    }
    assert.equal(listBody.sessions.length, 1)
    assert.equal(listBody.sessions[0].id, created.body.session.id)
    assert.equal(listBody.sessions[0].topic, '列表接口会话')
  })
})

test('HTTP 克隆接口创建继承上下文的克隆分支', async () => {
  await withApi(async (baseUrl) => {
    const sessionResult = await postJson<CreateSessionResponse>(
      `${baseUrl}/api/sessions`,
      { topic: 'HTTP 克隆验证' },
    )
    const sessionId = sessionResult.body.session.id

    await postJson<SendMessageResponse>(
      `${baseUrl}/api/sessions/${sessionId}/nodes/self-attention/messages`,
      { content: '克隆前的内容 161616' },
    )
    const cloneResult = await postJson<CreateBranchResponse>(
      `${baseUrl}/api/sessions/${sessionId}/nodes/self-attention/clone`,
      {},
    )

    assert.equal(cloneResult.response.status, 201)
    assert.equal(cloneResult.body.node.parentId, 'self-attention')
    assert.equal(cloneResult.body.node.contextMode, 'inherit')

    const contextResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/nodes/${cloneResult.body.node.id}/context`,
    )
    const contextBody = (await contextResponse.json()) as {
      context: { inherited: boolean; messages: Array<{ content: string }> }
    }
    assert.equal(contextBody.context.inherited, true)
    assert.ok(
      contextBody.context.messages.some((m) =>
        m.content.includes('克隆前的内容 161616'),
      ),
    )
  })
})

test('HTTP 接口支持解锁与知识地图', async () => {
  await withApi(async (baseUrl) => {
    const sessionResult = await postJson<CreateSessionResponse>(
      `${baseUrl}/api/sessions`,
      { topic: 'HTTP 阶段四验证' },
    )
    const sessionId = sessionResult.body.session.id
    const locked = sessionResult.body.session.nodes.find(
      (node) => node.status === 'locked',
    )
    assert.ok(locked)

    const unlockResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/nodes/${locked.id}/unlock`,
      { method: 'POST' },
    )
    assert.equal(unlockResponse.status, 200)
    const unlockBody = (await unlockResponse.json()) as UpdateNodeResponse
    assert.equal(unlockBody.node.status, 'exploring')

    const mapResponse = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/knowledge-map`,
    )
    assert.equal(mapResponse.status, 200)
    const mapBody = (await mapResponse.json()) as {
      knowledgeMap: { concepts: unknown[]; links: unknown[] }
    }
    assert.equal(mapBody.knowledgeMap.concepts.length, 8)
    assert.ok(mapBody.knowledgeMap.links.length > 0)
  })
})

async function withApi(run: (baseUrl: string) => Promise<void>) {
  const server = createServer(
    createApiHandler(new LearningStore({ modelGateway: createFakeGateway() })),
  )
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

// ===========================================================================
// 回合树 HTTP 接口
// ===========================================================================

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

    const ctxA = await (
      await fetch(
        `${base}/api/turn-sessions/${sid}/turns/${aBody.body.turn.id}/context`,
      )
    ).json() as GetTurnContextResponse
    const ctxB = await (
      await fetch(
        `${base}/api/turn-sessions/${sid}/turns/${bBody.body.turn.id}/context`,
      )
    ).json() as GetTurnContextResponse

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
    const { response, body } = await postJson<{ error: { code: string } }>(
      `${base}/api/turn-sessions`,
      { userContent: '   ' },
    )
    assert.equal(response.status, 400)
    assert.equal(body.error.code, 'INVALID_INPUT')
  })
})

async function withTurnApi(run: (baseUrl: string) => Promise<void>) {
  const registry = new TurnStoreRegistry({
    modelGateway: createFakeGateway(),
  })
  const server = createServer(createApiHandler(new LearningStore(), registry))
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
          resolve(undefined)
        }
      })
    })
  }
}

// 避免未使用类型导入告警（TurnSessionDTO 用于未来扩展）
export type { TurnSessionDTO }
