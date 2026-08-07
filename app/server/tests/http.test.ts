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
import { createApiHandler } from '../src/http.ts'
import { LearningStore } from '../src/learningStore.ts'
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
