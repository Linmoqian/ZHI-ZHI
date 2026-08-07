# 数据结构

知枝以「回合树」为核心模型。本文档描述从持久化到前端渲染的全部数据结构，
以及它们在各层之间的流转关系。

> 设计原理与决策记录见 [回合树重构.md](回合树重构.md)。

---

## 1. 核心概念

| 概念 | 定义 |
|------|------|
| **回合 (Turn)** | 一次用户输入 + 一次模型输出，是树的最小节点单位 |
| **回合树 (Turn Tree)** | 回合通过 `parentId` 形成的树状结构，根回合 = 会话首轮 |
| **会话 (Session)** | 一棵回合树 + 其内容仓库；`topic` 取根回合的用户输入 |
| **上下文 (Context)** | 从某个叶回合回溯到根的唯一路径；**分叉即隔离** |
| **分叉 (Fork)** | 从任意回合创建新的子回合，形成平行支线 |

关键决策：

- **回合粒度**，而非单条消息——用户+助手成对，一个节点
- **混合指针**：`parentId` 不可变并持久化；`childIds` 为运行时派生索引，不持久化
- **内容寻址**：回合只存哈希，原文存在 `ContentStore`，相同内容自动去重
- **无状态机**：回合没有 status/tone/position 字段，颜色按深度派生、坐标按布局算法派生
- **纯净上下文**：移除了旧的 `inherit/isolated` 开关，分叉天然隔离

---

## 2. 分层架构

```
┌─────────────────────────────────────────────────┐
│  前端 (app/src)                                  │
│  TurnDTO / TurnSessionDTO / TurnContextDTO       │
│  ↕ HTTP (JSON)                                   │
├─────────────────────────────────────────────────┤
│  API 契约 (app/shared/contracts.ts)              │
│  请求/响应类型，前后端共享                        │
├─────────────────────────────────────────────────┤
│  后端领域模型 (app/server/src/domain.ts)         │
│  TurnNode / TurnSession / CompiledTurn           │
│  TurnSessionDump (快照)                          │
├─────────────────────────────────────────────────┤
│  持久化 (app/server/src/turnJournal.ts)          │
│  TurnJournalEvent / SerializedTurn / Dump        │
└─────────────────────────────────────────────────┘
```

---

## 3. 领域模型（后端内存）

> 定义于 `app/server/src/domain.ts`，是后端运行时的权威数据结构。

### 3.1 TurnNode — 回合（树节点）

```ts
type TurnNode = {
  id: string                         // UUID
  parentId: string | null            // 父回合；null = 根回合
  userContentHash: string            // 用户输入的 SHA-256 哈希
  assistantContentHash: string       // 模型输出的 SHA-256 哈希
  createdAt: string                  // ISO 8601 时间戳
}
```

回合**只存哈希指针**，不存原文。原文通过 `ContentStore` 查询：

```
turn.userContentHash → ContentStore.get(hash) → "什么是注意力机制？"
```

### 3.2 TurnSession — 回合树会话

```ts
type TurnSession = {
  id: string                         // UUID
  topic: string                      // = 根回合的 user 输入
  createdAt: string                  // ISO 8601
  turns: Map<string, TurnNode>       // 回合表（id → TurnNode）
}
```

- `turns` 用 `Map` 存储，O(1) 查找
- **没有 `childIds` 字段**——子索引运行时从 `parentId` 重建（见 3.5）

### 3.3 CompiledTurn / CompiledTurnContext — 编译后的上下文

```ts
type CompiledTurn = {
  id: string
  parentId: string | null
  userContent: string                // 已解析为明文
  assistantContent: string           // 已解析为明文
  createdAt: string
}

type CompiledTurnContext = {
  sessionId: string
  leafTurnId: string                 // 回溯起点
  topic: string
  turns: CompiledTurn[]              // 根 → 叶，时间序
}
```

编译过程（`turnStore.compileContext`）：

1. 从 `leafTurnId` 出发，沿 `parentId` 回溯到根
2. 反转得到 根 → 叶 的时间序
3. 对每个回合，用哈希从 `ContentStore` 解析出明文
4. 循环检测：记录已访问 id，遇到重复立即停止

```
        root                    编译 leafB 的上下文：
       /    \
      A      C                  turns = [root, C, leafB]
      |      |
    leafA  leafB                ← 只含这条路径，leafA 不可见
```

### 3.4 TurnSessionDump — 可序列化快照

```ts
type TurnSessionDump = {
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
  blobs: Array<{                   // ContentStore 的全部内容
    hash: string
    content: string
    referenceCount: number
  }>
}
```

快照 = 回合结构 + 全部内容 Blob，完全自包含，可独立恢复会话。

### 3.5 ContentStore — 内容寻址仓库

```ts
type ContentBlob = {
  content: string                   // 原文
  referenceCount: number            // 被引用次数（用于去重）
}
```

- `add(content)` → 计算 SHA-256，已存在则 `referenceCount++`，返回 hash
- `get(hash)` → 返回原文
- 相同内容只存一份，天然去重

---

## 4. API 契约（前后端共享）

> 定义于 `app/shared/contracts.ts`。后端用，前端也用。

### 4.1 DTO（数据传输对象）

DTO 与领域模型的关键区别：**内容已解析为明文**，前端无需关心哈希。

```ts
type TurnDTO = {
  id: string
  parentId: string | null
  userContent: string               // 明文，非哈希
  assistantContent: string          // 明文，非哈希
  createdAt: string
}

type TurnSessionDTO = {
  id: string
  topic: string
  createdAt: string
  turns: TurnDTO[]                  // 数组，非 Map
}

type TurnContextDTO = {
  sessionId: string
  leafTurnId: string
  topic: string
  turns: TurnDTO[]                  // 根 → 叶路径
}

type TurnSessionSummary = {         // 列表项（首页）
  id: string
  topic: string
  createdAt: string
  turnCount: number                 // 回合数，展示体量
}
```

### 4.2 请求 / 响应

| 操作 | 请求 | 响应 |
|------|------|------|
| 创建会话 | `{ userContent: string }` | `{ session: TurnSessionDTO }` |
| 追加回合 | `{ parentId, userContent }` | `{ turn: TurnDTO }` |
| 分叉回合 | `{ parentId, userContent }` | `{ turn: TurnDTO }` |
| 编辑回合 | `{ userContent?, assistantContent? }` | `{ turn: TurnDTO }` |
| 获取上下文 | — | `{ context: TurnContextDTO }` |
| 列出会话 | — | `{ sessions: TurnSessionSummary[] }` |

### 4.3 错误响应

```ts
type ApiErrorPayload = {
  error: {
    code: string                    // 如 'INVALID_INPUT'、'TURN_NOT_FOUND'
    message: string                 // 人类可读的中文说明
  }
}
```

---

## 5. 持久化结构

> 定义于 `app/server/src/turnJournal.ts`。采用**追加日志 + 定期快照**模式。

### 5.1 事件类型

只有两种事件，覆盖全部变更：

```ts
type TurnJournalEvent =
  | {
      type: 'turn_appended'          // 新增回合（生长或分叉）
      sessionId: string
      turn: SerializedTurn           // 回合结构（含哈希）
      userContent: string            // 原文（自包含，可重放）
      assistantContent: string
      createdAt: string
    }
  | {
      type: 'turn_updated'           // 编辑回合内容
      sessionId: string
      turn: SerializedTurn
      userContent?: string           // 仅变更字段携带
      assistantContent?: string
    }

type SerializedTurn = {
  id: string
  parentId: string | null
  userContentHash: string
  assistantContentHash: string
  createdAt: string
}
```

**设计要点**：事件自包含——携带原文而非仅哈希，重放时无需外部查找。

### 5.2 存储格式

```
.data/turn-sessions/
├── <sessionId>/
│   ├── events.log          # 追加日志，每行一个 JSON 事件
│   └── snapshot.json       # 定期快照（达到事件阈值后压缩生成）
```

- 写入：事件追加到 `events.log`
- 压缩：达到阈值（默认 64 事件）后，将全量状态写入 `snapshot.json`，清空日志
- 读取：先加载快照，再重放日志中剩余事件

### 5.3 Persistor 接口

```ts
type TurnPersistor = {
  append(sessionId, events, snapshot): Promise<void>
  load(sessionId): Promise<TurnSessionDump | null>
  listSessionIds(): Promise<string[]>
}
```

---

## 6. API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/turn-sessions` | 创建会话（含根回合） |
| `GET` | `/api/turn-sessions` | 列出所有会话 |
| `GET` | `/api/turn-sessions/:id` | 获取单个会话 |
| `POST` | `/api/turn-sessions/:id/turns` | 追加回合（生长） |
| `POST` | `/api/turn-sessions/:id/turns/:turnId/fork` | 从指定回合分叉 |
| `PATCH` | `/api/turn-sessions/:id/turns/:turnId` | 编辑回合内容 |
| `GET` | `/api/turn-sessions/:id/turns/:turnId/context` | 获取叶→根上下文 |

---

## 7. 数据流转示例

### 创建会话 → 追加 → 分叉

```
1. POST /api/turn-sessions  { userContent: "什么是注意力机制？" }
   后端: create(userContent)
         ├─ ContentStore.add("什么是注意力机制？") → hash_A
         ├─ 模型生成回复 → ContentStore.add("注意力是...") → hash_B
         └─ 根回合 { id: t1, parentId: null, userHash: A, asstHash: B }
   返回: { session: { id: s1, topic: "什么是注意力机制？", turns: [t1] } }

2. POST /api/turn-sessions/s1/turns  { parentId: t1, userContent: "具体说说" }
   后端: appendTurn(parentId=t1, userContent)
         ├─ 编译 t1 上下文 → [t1]
         ├─ 模型基于上下文生成回复
         └─ 新回合 { id: t2, parentId: t1, ... }
   返回: { turn: t2 }

3. POST /api/turn-sessions/s1/turns/t1/fork  { userContent: "换个角度" }
   后端: forkTurn(parentId=t1, userContent)
         ├─ 从 t1 分叉（与 t2 平行）
         └─ 新回合 { id: t3, parentId: t1, ... }
   返回: { turn: t3 }

最终树结构:
         t1 (根)
        /  \
      t2    t3
```

### 上下文编译

```
请求: GET /api/turn-sessions/s1/turns/t2/context

t2 的上下文 = [t1, t2]        ← t3 不可见
t3 的上下文 = [t1, t3]        ← t2 不可见
```

---

## 8. 字段速查

### 8.1 内容表示对照

| 层 | 用户输入字段 | 类型 | 说明 |
|----|-------------|------|------|
| 领域模型 (`TurnNode`) | `userContentHash` | string | SHA-256 哈希 |
| 持久化事件 | `userContent` | string | 明文（自包含） |
| API DTO (`TurnDTO`) | `userContent` | string | 明文（已解析） |

### 8.2 树结构表示对照

| 层 | 父指针 | 子指针 | 存储 |
|----|--------|--------|------|
| 领域模型 | `parentId`（不可变） | 无（派生） | `Map<id, TurnNode>` |
| API DTO | `parentId` | 无 | 数组，前端自行建索引 |
| 持久化 | `parentId` | 无 | 日志/快照 |

### 8.3 为什么没有这些字段

| 移除的字段 | 原因 | 替代方案 |
|-----------|------|---------|
| `status`（节点状态） | 无状态机 | 前端按 isLeaf/depth 派生样式 |
| `tone`（色调） | 自动派生 | `toneForDepth(depth)` 循环取色 |
| `position`（坐标） | 布局算法计算 | `computeLayout(turns)` DFS 定位 |
| `contextMode` | 分叉天然隔离 | 从叶到根的路径即纯净上下文 |
| `summary`（摘要） | 暂未集成 | 计划：根回合摘要作为 topic |
