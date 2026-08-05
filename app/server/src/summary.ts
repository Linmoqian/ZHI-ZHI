import type { CompiledContextMessage, StructuredSummary } from './domain.ts'

/**
 * 本地确定性分层摘要生成：不依赖模型，从一段原文聚合出结构化摘要。
 * 在真实模型不可用或需要稳定回退时使用；也为模型增强摘要提供基线。
 */
export const SUMMARY_BLOCK_SIZE = 4

export function buildSummaryBlock(
  topic: string,
  messages: CompiledContextMessage[],
): StructuredSummary {
  const userLines = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  const assistantLines = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)

  return {
    goal: `围绕「${topic}」继续推进，回顾本段内的提问与回答。`,
    establishedFacts: assistantLines.map((line) => trimLine(line)),
    userUnderstanding: [],
    openQuestions: userLines.map((line) => trimLine(line)),
    nodeRefs: [...new Set(messages.map((message) => message.branchId))],
  }
}

/**
 * 将分支完整历史切分为：远端分层摘要块（最旧到较新）+ 近期原始消息。
 * 返回 { summaries, recentMessages }，供动态上下文编译使用。
 */
export function splitHistory<T extends CompiledContextMessage>(
  fullReversed: T[],
  recentLimit: number,
  topic = '',
): { summaries: StructuredSummary[]; recentMessages: T[] } {
  // fullReversed 是“最新优先”；转为“最旧优先”后再处理，保证时间顺序。
  const chronological = [...fullReversed].reverse()

  const head = Math.max(0, chronological.length - recentLimit)
  const recentMessages = chronological.slice(head)
  const remote = chronological.slice(0, head)

  const summaries: StructuredSummary[] = []
  for (let i = 0; i < remote.length; i += SUMMARY_BLOCK_SIZE) {
    const block = remote.slice(i, i + SUMMARY_BLOCK_SIZE)
    if (block.length > 0) {
      summaries.push(buildSummaryBlock(topic, block))
    }
  }
  return { summaries, recentMessages }
}

function trimLine(line: string) {
  return line.length > 120 ? `${line.slice(0, 120)}…` : line
}
