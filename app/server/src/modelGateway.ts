import type { CompiledContext } from './domain.ts'

export type ModelGateway = {
  /** 根据编译后的分支上下文生成助手回复；失败时抛出异常。 */
  complete(input: ModelInput): Promise<string>
}

export type ModelInput = {
  compiledContext: CompiledContext
  userMessage: string
}

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: ChatRole
  content: string
}

export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

const SYSTEM_PROMPT = [
  '你是“知枝”，一款可分支、可回溯、可合并的 AI 学习助手。',
  '你用简体中文回答，面向正在自主学习的用户。',
  '回答要具体、诚实、面向理解，不确定时明确说明，不编造事实。',
  '你收到的上下文来自一条独立的学习分支，只有这条分支可见的内容才会出现；不要猜测其他分支的内容。',
].join('\n')

/**
 * 组装模型输入：系统指令 + 编译出的分支上下文（父链摘要、近期原文、工作记忆）。
 */
export function assembleModelInput(
  compiledContext: CompiledContext,
  userMessage: string,
): ModelInput {
  return { compiledContext, userMessage }
}

/**
 * 将编译出的分支上下文转为模型可见的消息序列。
 */
export function toChatMessages(input: ModelInput): ChatMessage[] {
  const { compiledContext, userMessage } = input
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  const topicLine = `当前学习主题：${compiledContext.topic}`
  const modeLine = compiledContext.inherited
    ? '本分支继承创建时的父节点上下文，但不会读取同级分支。'
    : '本分支与父节点及同级分支隔离，只使用当前分支的消息。'
  messages.push({
    role: 'system',
    content: [topicLine, modeLine].join('\n'),
  })

  const visible = compiledContext.messages
  if (visible.length > 0) {
    const body = visible
      .map(
        (message) =>
          `[${message.role === 'user' ? '用户' : '助手'}] ${message.content}`,
      )
      .join('\n')
    messages.push({
      role: 'system',
      content: `以下是本分支可见的近期历史消息：\n${body}`,
    })
  }

  if (compiledContext.summaryBlocks.length > 0) {
    const blocks = compiledContext.summaryBlocks
      .map((summary, index) => {
        const facts = summary.establishedFacts.map(
          (fact) => `- ${fact}`).join('\n')
        const questions = summary.openQuestions
          .map((question) => `- ${question}`)
          .join('\n')
        return [
          `第 ${index + 1} 段摘要（较早历史）：`,
          `目标：${summary.goal}`,
          facts ? `已建立事实：\n${facts}` : '',
          questions ? `先前疑问：\n${questions}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      })
      .join('\n\n')
    messages.push({
      role: 'system',
      content: `本分支较早的历史已压缩为如下分层摘要，仅供参考：\n${blocks}`,
    })
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

  return {
    async complete(input) {
      const conversation = toChatMessages(input)
      const response = await fetchImpl(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: conversation,
          stream: false,
          options: { num_predict: numPredict, temperature },
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
