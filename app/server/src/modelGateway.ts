import type { CompiledTurn } from './domain.ts'

export type ModelGateway = {
  /** 根据编译后的回合路径生成助手回复；失败时抛出异常。 */
  complete(input: ModelInput): Promise<string>
  /** 用独立提示词生成「一句话概括」；失败时抛出异常。 */
  summarize(content: string): Promise<string>
  /** 连通性探测，供设置页「测试连接」使用。 */
  testConnection(): Promise<{ ok: true; message: string } | { ok: false; message: string }>
}

export type ModelInput = {
  topic: string
  /** 根 → 叶时间序的可见回合路径。 */
  turns: CompiledTurn[]
  userMessage: string
}

const SUMMARIZE_SYSTEM_PROMPT = '一句话概括以下内容，要求精炼、贴近原意、不要展开。'

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: ChatRole
  content: string
}

export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

const SYSTEM_PROMPT = [
  '你是「知枝」，一款可分支、可回溯的 AI 学习助手。',
  '你用简体中文回答，面向正在自主学习的用户。',
  '回答要具体、诚实、面向理解，不确定时明确说明，不编造事实。',
  '你收到的上下文来自一条独立的学习支线，只有这条支线可见的回合才会出现；不要猜测其他支线的内容。',
].join('\n')

/**
 * 组装模型输入：系统指令 + 可见回合路径（根→叶）+ 本轮用户输入。
 */
export function assembleModelInput(
  topic: string,
  turns: CompiledTurn[],
  userMessage: string,
): ModelInput {
  return { topic, turns, userMessage }
}

/**
 * 将回合路径转为模型可见的消息序列。
 * 回合树模型下，可见上下文 = 从叶到根的唯一路径，分叉即隔离。
 */
export function toChatMessages(input: ModelInput): ChatMessage[] {
  const { topic, turns, userMessage } = input
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  messages.push({
    role: 'system',
    content: [
      `当前对话主题：${topic}`,
      '以下是你与用户在本支线上的完整可见历史，分叉出去的其他支线对你不可见。',
    ].join('\n'),
  })

  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.userContent })
    messages.push({ role: 'assistant', content: turn.assistantContent })
  }

  messages.push({ role: 'user', content: userMessage })
  return messages
}

/**
 * 通过本地 Ollama 的 /api/chat 非流式接口完成一次生成。
 * 默认使用参数量小的模型，避免在低内存环境卡死。
 */
export function createOllamaGateway(options: {
  endpoint?: string
  model: string
  numPredict?: number
  temperature?: number
  fetchImpl?: typeof fetch
}): ModelGateway {
  const endpoint = (options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(
    /\/$/,
    '',
  )
  const model = options.model
  const numPredict = options.numPredict ?? 512
  const temperature = options.temperature ?? 0.4
  const fetchImpl = options.fetchImpl ?? fetch

  async function chat(
    messages: ChatMessage[],
    overrides?: { numPredict?: number; temperature?: number },
  ) {
    const response = await fetchImpl(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: overrides?.numPredict ?? numPredict,
          temperature: overrides?.temperature ?? temperature,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      throw new Error(
        `Ollama 请求失败：HTTP ${response.status} ${response.statusText}`,
      )
    }

    const payload = (await response.json()) as {
      message?: { content?: string }
      error?: string
    }
    if (payload.error) {
      throw new Error(`Ollama 返回错误：${payload.error}`)
    }
    const content = payload.message?.content?.trim()
    if (!content) {
      throw new Error('Ollama 返回了空回复')
    }
    return content
  }

  async function probeTags() {
    const response = await fetchImpl(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(
        `Ollama 探测失败：HTTP ${response.status} ${response.statusText}`,
      )
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string }>
    }
    const available = payload.models?.some(
      (entry) => entry.name === model,
    )
    return available
      ? `已连接 Ollama，模型 ${model} 可用`
      : `已连接 Ollama，但未找到模型 ${model}（请先拉取）`
  }

  return {
    async complete(input) {
      const conversation = toChatMessages(input)
      return chat(conversation)
    },

    async summarize(content) {
      // 独立提示词：不与知枝助手的回复角色混用。
      return chat([
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content },
      ])
    },

    async testConnection() {
      try {
        const message = await probeTags()
        return { ok: true, message }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, message }
      }
    },
  }
}

/**
 * 读取环境变量中的 Ollama 模型配置。
 */
export function resolveModelFromEnv(env: NodeJS.ProcessEnv): string {
  const explicit = env.ZHIZHI_MODEL?.trim()
  if (explicit) {
    return explicit
  }
  // 默认使用本地最小、最稳定的文本模型，避免硬件卡死。
  return 'llama2:latest'
}

// -----------------------------------------------------------------------------
// 云端供应商：DeepSeek（OpenAI 兼容接口）
//
// 文档：https://api-docs.deepseek.com/zh-cn/
// 端点：POST {baseUrl}/chat/completions，Header Authorization: Bearer <apiKey>
// 模型：deepseek-v4-flash / deepseek-reasoner（R1），默认 deepseek-v4-flash
// -----------------------------------------------------------------------------

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'

/** DeepSeek（及兼容端点）网关，走 OpenAI 兼容的 chat/completions。 */
export function createDeepSeekGateway(options: {
  apiKey: string
  baseUrl?: string
  model?: string
  numPredict?: number
  temperature?: number
  fetchImpl?: typeof fetch
}): ModelGateway {
  const baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(
    /\/$/,
    '',
  )
  const model = options.model ?? DEFAULT_DEEPSEEK_MODEL
  const apiKey = options.apiKey.trim()
  const numPredict = options.numPredict ?? 1024
  const temperature = options.temperature ?? 0.4
  const fetchImpl = options.fetchImpl ?? fetch

  async function chat(
    messages: ChatMessage[],
    overrides?: { temperature?: number },
  ) {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        max_tokens: overrides ? undefined : numPredict,
        temperature: overrides?.temperature ?? temperature,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const detail = await safeReadError(response)
      throw new Error(
        `DeepSeek 请求失败：HTTP ${response.status} ${response.statusText}${detail}`,
      )
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string } | string
    }
    const errorMessage =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message
    if (errorMessage) {
      throw new Error(`DeepSeek 返回错误：${errorMessage}`)
    }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('DeepSeek 返回了空回复')
    }
    return content
  }

  async function probeModels() {
    const response = await fetchImpl(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const detail = await safeReadError(response)
      throw new Error(
        `DeepSeek 鉴权失败：HTTP ${response.status}${detail}`,
      )
    }
    return `已连接 DeepSeek，模型 ${model}`
  }

  return {
    async complete(input) {
      return chat(toChatMessages(input))
    },

    async summarize(content) {
      return chat([
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content },
      ])
    },

    async testConnection() {
      try {
        const message = await probeModels()
        return { ok: true, message }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, message }
      }
    },
  }
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text ? `：${text.slice(0, 200)}` : ''
  } catch {
    return ''
  }
}
