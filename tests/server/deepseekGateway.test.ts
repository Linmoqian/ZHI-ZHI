import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDeepSeekGateway,
  createOllamaGateway,
} from '../../app/server/src/modelGateway.ts'

/**
 * DeepSeek 网关：验证请求落点（OpenAI 兼容 chat/completions）、鉴权头、回复解析。
 * 不访问真实网络，用注入的 fetchImpl 断言请求形态并回放固定响应。
 */
test('DeepSeek 网关：complete 发送到正确端点并携带 Bearer 鉴权', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    capturedUrl = url.toString()
    capturedInit = init
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '来自 DeepSeek 的回复' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const gateway = createDeepSeekGateway({
    apiKey: 'sk-test-1234567890',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  const reply = await gateway.complete({
    topic: '测试',
    turns: [],
    userMessage: '你好',
  })

  assert.equal(reply, '来自 DeepSeek 的回复')
  assert.equal(capturedUrl, 'https://api.deepseek.com/chat/completions')
  assert.equal(capturedInit?.method, 'POST')
  const headers = new Headers(capturedInit?.headers)
  assert.equal(headers.get('Authorization'), 'Bearer sk-test-1234567890')
  const body = JSON.parse(String(capturedInit?.body))
  assert.equal(body.model, 'deepseek-chat')
  assert.equal(body.stream, false)
})

test('DeepSeek 网关：HTTP 错误时抛出含状态码的异常', async () => {
  const fetchImpl = async () =>
    new Response('{"error":{"message":"invalid api key"}}', {
      status: 401,
    })

  const gateway = createDeepSeekGateway({
    apiKey: 'sk-bad',
    fetchImpl: fetchImpl as typeof fetch,
  })

  await assert.rejects(
    gateway.complete({ topic: '', turns: [], userMessage: 'x' }),
    /401/,
  )
})

test('DeepSeek 网关：空回复抛错', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), {
      status: 200,
    })

  const gateway = createDeepSeekGateway({
    apiKey: 'sk-x',
    fetchImpl: fetchImpl as typeof fetch,
  })

  await assert.rejects(
    gateway.complete({ topic: '', turns: [], userMessage: 'x' }),
    /空回复/,
  )
})

test('DeepSeek 网关：testConnection 成功路径', async () => {
  const fetchImpl = async () => new Response('{"data":[]}', { status: 200 })
  const gateway = createDeepSeekGateway({
    apiKey: 'sk-ok',
    fetchImpl: fetchImpl as typeof fetch,
  })
  const result = await gateway.testConnection()
  assert.equal(result.ok, true)
})

test('DeepSeek 网关：testConnection 鉴权失败路径', async () => {
  const fetchImpl = async () => new Response('', { status: 401 })
  const gateway = createDeepSeekGateway({
    apiKey: 'sk-bad',
    fetchImpl: fetchImpl as typeof fetch,
  })
  const result = await gateway.testConnection()
  assert.equal(result.ok, false)
  assert.match(result.message, /401/)
})

test('Ollama 网关：testConnection 模型可用路径', async () => {
  const fetchImpl = async (url: string | URL) => {
    assert.match(url.toString(), /\/api\/tags$/)
    return new Response(
      JSON.stringify({ models: [{ name: 'llama2:latest' }] }),
      { status: 200 },
    )
  }
  const gateway = createOllamaGateway({
    endpoint: 'http://127.0.0.1:11434',
    model: 'llama2:latest',
    fetchImpl: fetchImpl as typeof fetch,
  })
  const result = await gateway.testConnection()
  assert.equal(result.ok, true)
})
