// 回合树领域模型。
//
// 一个回合 = 一次用户输入 + 一次模型输出；回合间通过 parentId 形成树。
// 上下文 = 从叶到根的唯一路径，分叉即隔离，无需 inherit/isolated 开关。
// 详见 docs/回合树重构.md。

/** 回合树的一个节点：一次用户输入 + 一次模型输出。 */
export type TurnNode = {
  id: string
  /** 父回合；null 表示根回合（会话的首轮）。 */
  parentId: string | null
  /** 用户输入的内容寻址哈希。 */
  userContentHash: string
  /** 模型输出的内容寻址哈希。 */
  assistantContentHash: string
  createdAt: string
}

/**
 * 回合树会话：一棵回合树 + 内容仓库。
 * topic 取根回合的 user 输入；childIndex 为可重建的派生索引，不持久化。
 */
export type TurnSession = {
  id: string
  topic: string
  createdAt: string
  turns: Map<string, TurnNode>
}

/** 回合树上下文编译后的一条可见回合。 */
export type CompiledTurn = {
  id: string
  parentId: string | null
  userContent: string
  assistantContent: string
  createdAt: string
}

/** 回合树上下文编译结果：从根到某叶的纯净路径。 */
export type CompiledTurnContext = {
  sessionId: string
  leafTurnId: string
  topic: string
  /** 根 → 叶时间序的完整回合路径。 */
  turns: CompiledTurn[]
}

/** 回合树会话的可序列化快照，用于持久化与恢复。 */
export type TurnSessionDump = {
  id: string
  topic: string
  createdAt: string
  turns: Array<{
    id: string
    parentId: string | null
    userContentHash: string
    assistantContentHash: string
    createdAt: string
  }>
  blobs: Array<{
    hash: string
    content: string
    referenceCount: number
  }>
}
