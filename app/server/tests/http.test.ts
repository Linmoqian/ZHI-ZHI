import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import type {
  CreateBranchResponse,
  CreateSessionResponse,
  SendMessageResponse,
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
