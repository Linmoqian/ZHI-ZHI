import type { ContentStore } from './contentStore.ts'
import type {
  CompiledContext,
  SessionRecord,
  StoredMessage,
} from './domain.ts'
import { ApiError } from './errors.ts'

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

  const path = reversedPath
    .reverse()
    .slice(-Math.max(1, recentMessageLimit))

  return {
    sessionId: session.id,
    branchId,
    topic: session.topic,
    inherited: branch.contextMode === 'inherit',
    messages: path.map((message) => ({
      id: message.id,
      branchId: message.branchId,
      role: message.role,
      content: contentStore.get(message.contentHash),
    })),
  }
}
