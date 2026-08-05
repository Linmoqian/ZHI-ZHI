import type { ContentStore } from './contentStore.ts'
import type {
  CompiledContext,
  CompiledContextMessage,
  SessionRecord,
  StoredMessage,
} from './domain.ts'
import { ApiError } from './errors.ts'
import { splitHistory } from './summary.ts'

const DEFAULT_RECENT_MESSAGE_LIMIT = 12

export function compileBranchContext(
  session: SessionRecord,
  contentStore: ContentStore,
  branchId: string,
  recentMessageLimit = DEFAULT_RECENT_MESSAGE_LIMIT,
): CompiledContext {
  const branch = session.branches.get(branchId)
  if (!branch) {
    throw new ApiError(404, 'BRANCH_NOT_FOUND', '学习分支不存在')
  }

  const reversedPath: StoredMessage[] = []
  const visited = new Set<string>()
  let cursorId = branch.headMessageId

  while (cursorId) {
    if (
      branch.contextMode === 'isolated' &&
      cursorId === branch.baseMessageId
    ) {
      break
    }
    if (visited.has(cursorId)) {
      throw new ApiError(500, 'MESSAGE_CYCLE', '消息链出现循环引用')
    }

    const message = session.messages.get(cursorId)
    if (!message) {
      throw new ApiError(500, 'MESSAGE_NOT_FOUND', '消息链引用已丢失')
    }

    visited.add(cursorId)
    reversedPath.push(message)
    cursorId = message.parentId
  }

  // 完整可见链“最新优先”。把远端历史压缩为分层摘要，只保留近期原文。
  const allMessages: CompiledContextMessage[] = reversedPath.map(
    (message) => ({
      id: message.id,
      branchId: message.branchId,
      role: message.role,
      content: contentStore.get(message.contentHash),
    }),
  )
  const { summaries, recentMessages } = splitHistory(
    allMessages,
    Math.max(1, recentMessageLimit),
    session.topic,
  )

  return {
    sessionId: session.id,
    branchId,
    topic: session.topic,
    inherited: branch.contextMode === 'inherit',
    messages: recentMessages,
    summaryBlocks: summaries,
  }
}
