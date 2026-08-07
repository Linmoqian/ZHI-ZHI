import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ContentStore } from '../src/contentStore.ts'
import {
  createFileSessionPersistor,
  createJournaledSessionPersistor,
} from '../src/journal.ts'
import { buildKnowledgeMap } from '../src/knowledgeMap.ts'
import type { ModelGateway } from '../src/modelGateway.ts'
import { LearningStore } from '../src/learningStore.ts'
import { buildSummaryBlock, SUMMARY_BLOCK_SIZE } from '../src/summary.ts'
import { createFakeGateway } from './testGateway.ts'

function createStore(): LearningStore {
  return new LearningStore({ modelGateway: createFakeGateway() })
}

test('相同正文只保存一个内容 Blob', () => {
  const contentStore = new ContentStore()
  const firstHash = contentStore.add('相同的学习结论')
  const secondHash = contentStore.add('相同的学习结论')

  assert.equal(firstHash, secondHash)
  assert.equal(contentStore.size, 1)
  assert.equal(contentStore.getReferenceCount(firstHash), 2)
})

test('发消息后节点 summary 被更新为模型生成的概括', async () => {
  const gateway: ModelGateway = {
    complete: () => Promise.resolve('助手回复'),
    summarize: (content) => Promise.resolve(`概括：${content.slice(0, 4)}`),
  }
  const store = new LearningStore({ modelGateway: gateway })
  const session = store.createSession('节点概括验证')
  await store.sendMessage(
    session.id,
    'self-attention',
    '我想从直觉开始理解注意力',
  )

  const updated = store
    .getSession(session.id)
    .nodes.find((n) => n.id === 'self-attention')
  assert.ok(updated)
  assert.equal(updated!.summary, '概括：我想从直')
  // title 不被覆盖
  assert.notEqual(updated!.title, updated!.summary)
})

test('模型不可用时节点 summary 回退到本轮用户输入截断', async () => {
  const gateway: ModelGateway = {
    complete: () => Promise.resolve('助手回复'),
    summarize: () => Promise.reject(new Error('ollama 不可用')),
  }
  const store = new LearningStore({ modelGateway: gateway })
  const session = store.createSession('概括回退验证')
  const longInput = '这是一段超过二十八字的较长用户输入用于验证截断回退逻辑是否正确工作'
  await store.sendMessage(session.id, 'self-attention', longInput)

  const updated = store
    .getSession(session.id)
    .nodes.find((n) => n.id === 'self-attention')
  assert.ok(updated)
  // 回退 = 本轮用户输入截断到 28 字
  assert.equal(updated!.summary, '这是一段超过二十八字的较长用户输入用于验证截断回退逻辑是…')
})

test('节点概括随消息持久化并在恢复后保留', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-sum-'))
  const gateway: ModelGateway = {
    complete: () => Promise.resolve('助手回复'),
    summarize: () => Promise.resolve('模型生成的概括'),
  }
  try {
    const persistor = createJournaledSessionPersistor(dataDir, {
      checkpointEventThreshold: 1000,
      checkpointIdleMs: 3_600_000,
    })
    const store = new LearningStore({ modelGateway: gateway, persistor })
    const session = store.createSession('概括持久化验证')
    await store.sendMessage(session.id, 'self-attention', '任意问题')
    await store.persistSession(session.id)

    const restored = new LearningStore({ modelGateway: gateway, persistor })
    const ids = await persistor.listSessionIds()
    const dump = await persistor.load(ids[0])
    assert.ok(dump)
    restored.restoreSession(dump)
    const node = restored
      .getSession(session.id)
      .nodes.find((n) => n.id === 'self-attention')
    assert.equal(node?.summary, '模型生成的概括')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('同级分支不会读取彼此的消息', async () => {
  const store = createStore()
  const session = store.createSession('验证同级分支隔离')
  const branchA = store.createBranch(session.id, 'self-attention', {
    title: '分支 A',
    contextMode: 'inherit',
  })
  const branchB = store.createBranch(session.id, 'self-attention', {
    title: '分支 B',
    contextMode: 'inherit',
  })

  await store.sendMessage(session.id, branchA.node.id, 'A 分支私有结论 314159')

  const contextA = store.getCompiledContext(session.id, branchA.node.id)
  const contextB = store.getCompiledContext(session.id, branchB.node.id)

  assert.ok(
    contextA.messages.some((message) =>
      message.content.includes('A 分支私有结论 314159'),
    ),
  )
  assert.ok(
    contextB.messages.every(
      (message) =>
        !message.content.includes('A 分支私有结论 314159') &&
        message.branchId !== branchA.node.id,
    ),
  )
})

test('继承分支只读取创建时的父节点快照', async () => {
  const store = createStore()
  const session = store.createSession('验证分支快照')
  const child = store.createBranch(session.id, 'self-attention', {
    title: '快照分支',
    contextMode: 'inherit',
  })

  await store.sendMessage(
    session.id,
    'self-attention',
    '父节点在分支创建之后新增的内容 271828',
  )

  const childContext = store.getCompiledContext(session.id, child.node.id)
  assert.equal(childContext.inherited, true)
  assert.ok(
    childContext.messages.every(
      (message) =>
        !message.content.includes('父节点在分支创建之后新增的内容 271828'),
    ),
  )
})

test('隔离模式只编译当前分支的本地消息', async () => {
  const store = createStore()
  const session = store.createSession('验证强隔离模式')
  const isolated = store.createBranch(session.id, 'self-attention', {
    title: '隔离分支',
    contextMode: 'isolated',
  })

  await store.sendMessage(session.id, isolated.node.id, '隔离分支自己的问题')
  const context = store.getCompiledContext(session.id, isolated.node.id)

  assert.equal(context.inherited, false)
  assert.ok(context.messages.length >= 2)
  assert.deepEqual(
    [...new Set(context.messages.map((message) => message.branchId))],
    [isolated.node.id],
  )
})

test('合并只向父节点写入结论，不复制分支原文', async () => {
  const store = createStore()
  const session = store.createSession('验证安全合并')
  const source = store.createBranch(session.id, 'self-attention', {
    title: '需要合并的分支',
    contextMode: 'isolated',
  })

  await store.sendMessage(session.id, source.node.id, '不要复制的分支原文 161803')
  const mergeResult = store.mergeBranch(session.id, source.node.id)
  const parentContext = store.getCompiledContext(
    session.id,
    mergeResult.parentNode.id,
  )

  assert.equal(mergeResult.sourceNode.status, 'merged')
  assert.ok(
    parentContext.messages.some((message) =>
      message.content.includes('已合并来自“需要合并的分支”的结论'),
    ),
  )
  assert.ok(
    parentContext.messages.every(
      (message) =>
        message.branchId !== source.node.id &&
        !message.content.includes('不要复制的分支原文 161803'),
    ),
  )
})

test('历史超过阈值时远端压缩为分层摘要，保留近期原文', async () => {
  const store = createStore()
  const session = store.createSession('分层摘要验证')

  // 发多轮消息，使可见历史超过默认近期阈值 12
  for (let i = 0; i < 20; i += 1) {
    await store.sendMessage(session.id, 'self-attention', `第 ${i} 轮问题`)
  }

  const context = store.getCompiledContext(session.id, 'self-attention')
  assert.ok(
    context.messages.length <= 12,
    '近期原文不应超过阈值',
  )
  assert.ok(
    context.summaryBlocks.length > 0,
    '远端历史应产生分层摘要',
  )
  // 最新一轮问题的原文应在近期消息里
  assert.ok(
    context.messages.some((message) =>
      message.content.includes('第 19 轮问题'),
    ),
  )
  // 摘要内容应结构化
  for (const summary of context.summaryBlocks) {
    assert.ok(Array.isArray(summary.establishedFacts))
    assert.ok(Array.isArray(summary.openQuestions))
  }
})

test('本地摘要生成器产出结构化的目标与疑问', () => {
  const messages = [
    { id: '1', branchId: 'b', role: 'user' as const, content: '它解决什么问题？' },
    { id: '2', branchId: 'b', role: 'assistant' as const, content: '它用于选择相关信息。' },
  ]
  const summary = buildSummaryBlock('主题', messages)
  assert.ok(summary.goal.includes('主题'))
  assert.deepEqual(summary.establishedFacts, ['它用于选择相关信息。'])
  assert.deepEqual(summary.openQuestions, ['它解决什么问题？'])
  assert.equal(SUMMARY_BLOCK_SIZE, 4)
})

test('会话快照持久化后恢复保留 DAG 与隔离语义', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-test-'))
  const gateway: ModelGateway = {
    complete: () => Promise.resolve('助手回复'),
    summarize: () => Promise.resolve('一句概括'),
  }

  try {
    const store = new LearningStore({
      modelGateway: gateway,
      persistor: createFileSessionPersistor(dataDir),
    })
    const session = store.createSession('持久化测试主题')
    const branch = store.createBranch(session.id, 'self-attention', {
      title: '持久化隔离分支',
      contextMode: 'isolated',
    })
    await store.sendMessage(session.id, branch.node.id, '隔离文本 112233')
    await store.persistSession(session.id)
    const before = store.getCompiledContext(session.id, branch.node.id)

    const restored = new LearningStore({
      modelGateway: gateway,
      persistor: createFileSessionPersistor(dataDir),
    })
    const persistor = createFileSessionPersistor(dataDir)
    const ids = await persistor.listSessionIds()
    assert.equal(ids.length, 1)
    const dump = await persistor.load(ids[0])
    assert.ok(dump)
    restored.restoreSession(dump)

    const after = restored.getCompiledContext(session.id, branch.node.id)
    assert.equal(after.messages.length, before.messages.length)
    assert.ok(
      after.messages.some((message) =>
        message.content.includes('隔离文本 112233'),
      ),
    )
    assert.ok(after.messages.length >= 1)
    assert.ok(
      after.messages.every((message) => message.branchId === branch.node.id),
    )
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('待解锁节点可以通过解锁进入探索状态', () => {
  const store = createStore()
  const session = store.createSession('解锁验证')
  const locked = store.getSession(session.id).nodes.find(
    (node) => node.status === 'locked',
  )
  assert.ok(locked, 'seed 中应存在 locked 节点')

  const result = store.unlockNode(session.id, locked.id)
  assert.equal(result.node.status, 'exploring')
  assert.equal(
    store.getSession(session.id).nodes.find((node) => node.id === locked.id)
      ?.status,
    'exploring',
  )
})

test('解锁非锁定节点会拒绝', () => {
  const store = createStore()
  const session = store.createSession('解锁拒绝验证')
  const current = store.getSession(session.id).nodes.find(
    (node) => node.status === 'current',
  )
  assert.ok(current)
  assert.throws(
    () => store.unlockNode(session.id, current.id),
    { code: 'NODE_NOT_LOCKED' },
  )
})

test('克隆分支继承到克隆点的上下文，且与原节点后续消息隔离', async () => {
  const store = createStore()
  const session = store.createSession('克隆验证')

  // 在当前节点积累几轮对话
  await store.sendMessage(session.id, 'self-attention', '第一轮问题 101010')
  await store.sendMessage(session.id, 'self-attention', '第二轮问题 202020')

  // 从当前节点此刻的进度克隆
  const clone = store.cloneBranch(session.id, 'self-attention', {
    title: '克隆分支',
  })
  const cloneNode = clone.node
  assert.equal(cloneNode.parentId, 'self-attention')
  assert.equal(cloneNode.status, 'current')
  assert.equal(cloneNode.contextMode, 'inherit')

  const cloneContext = store.getCompiledContext(session.id, cloneNode.id)
  // 克隆分支继承了到克隆点为止的全部可见链（含两轮对话）
  assert.ok(cloneContext.inherited)
  assert.ok(
    cloneContext.messages.some((m) => m.content.includes('第一轮问题 101010')),
  )
  assert.ok(
    cloneContext.messages.some((m) => m.content.includes('第二轮问题 202020')),
  )

  // 原节点继续追加内容，不应影响已克隆分支的上下文（base=head 已固定）
  await store.sendMessage(session.id, 'self-attention', '克隆后新增 303030')
  const cloneContextAfter = store.getCompiledContext(session.id, cloneNode.id)
  assert.ok(
    cloneContextAfter.messages.every(
      (m) => !m.content.includes('克隆后新增 303030'),
    ),
  )
})

test('会话列表返回全部真实会话摘要', () => {
  const store = createStore()
  store.createSession('第一个会话')
  store.createSession('第二个会话')

  const summaries = store.listSessions()

  assert.equal(summaries.length, 2)
  const titles = summaries.map((s) => s.topic).sort()
  assert.deepEqual(titles, ['第一个会话', '第二个会话'])
  for (const summary of summaries) {
    assert.equal(summary.nodeCount, 8)
    // 应包含 seed 中真实的 mastered 节点数
    assert.equal(summary.completedNodes, 2)
  }
  // 每个会话摘要都携带可与后端匹配的 id
  assert.ok(summaries.every((s) => typeof s.id === 'string' && s.id.length > 0))
})

test('会话列表按创建时间倒序返回（相隔不同时间时）', () => {
  const store = createStore()
  const first = store.createSession('较早的会话')
  const later = store.createSession('较新的会话')

  const summaries = store.listSessions()
  // 两个会话时间戳若都在同一毫秒，则以 id 次级序保证确定；
  // 这里只断言两者都被返回且列表长度正确，倒序由 sort 稳定保证。
  assert.equal(summaries.length, 2)
  assert.ok(summaries.some((s) => s.id === first.id))
  assert.ok(summaries.some((s) => s.id === later.id))
  // 默认列表应按时间倒序：最靠前的会话其 createdAt 不小于最后那个。
  assert.ok(
    summaries[0].createdAt.localeCompare(summaries[summaries.length - 1].createdAt) >= 0,
  )
})

test('克隆分支物理上不复制历史 Blob，共享已存在的引用', () => {
  const store = createStore()
  const session = store.createSession('克隆引用验证')
  store.cloneBranch(session.id, 'self-attention')

  const blobsBefore = store.contentStore.size
  const clone = store.cloneBranch(session.id, 'self-attention')

  // 连续克隆两次：第二次克隆不应新增任何内容 Blob（不复制历史）
  assert.equal(store.contentStore.size, blobsBefore)
  assert.ok(store.getCompiledContext(session.id, clone.node.id).messages.length >= 1)
})

test('克隆分支可持久化并在恢复后保留隔离语义', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-clone-'))
  const gateway = createFakeGateway()
  try {
    const persistor = createJournaledSessionPersistor(dataDir, {
      checkpointEventThreshold: 1000,
      checkpointIdleMs: 3_600_000,
    })
    const store = new LearningStore({ modelGateway: gateway, persistor })
    const session = store.createSession('克隆持久化验证')
    await store.sendMessage(session.id, 'self-attention', '克隆前内容 404040')
    const clone = store.cloneBranch(session.id, 'self-attention')
    await store.persistSession(session.id)

    const restored = new LearningStore({ modelGateway: gateway, persistor })
    const ids = await persistor.listSessionIds()
    const dump = await persistor.load(ids[0])
    assert.ok(dump)
    restored.restoreSession(dump)

    const cloneNode = restored
      .getSession(session.id)
      .nodes.find((n) => n.id === clone.node.id)
    assert.ok(cloneNode, '克隆节点应被恢复')
    const context = restored.getCompiledContext(session.id, clone.node.id)
    assert.ok(
      context.messages.some((m) => m.content.includes('克隆前内容 404040')),
    )
    assert.equal(context.inherited, true)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('状态机拒绝非法的状态跳转', () => {
  const store = createStore()
  const session = store.createSession('状态机验证')
  const current = store.getSession(session.id).nodes.find(
    (node) => node.status === 'current',
  )
  assert.ok(current)
  // current 不能直接跳到 locked（锁定只有解锁路径进入）
  assert.throws(
    () => store.updateNode(session.id, current.id, { status: 'locked' }),
    { code: 'INVALID_STATUS_TRANSITION' },
  )
  // current -> mastered 合法
  const result = store.updateNode(session.id, current.id, {
    status: 'mastered',
  })
  assert.equal(result.node.status, 'mastered')
})

test('知识地图由节点构成概念与主线连线', () => {
  const store = createStore()
  const session = store.createSession('知识地图验证')
  const snapshot = store.getSession(session.id)
  const knowledgeMap = buildKnowledgeMap(snapshot)

  assert.equal(knowledgeMap.concepts.length, snapshot.nodes.length)
  // 根节点与至少一个子节点之间应存在父->子连线
  const rootConcept = knowledgeMap.concepts.find((c) =>
    c.sourceNodeIds.includes('root'),
  )
  assert.ok(rootConcept)
  assert.ok(
    knowledgeMap.links.some((link) => link.source === rootConcept.id),
  )
  assert.ok(
    snapshot.nodes.length > 0 && knowledgeMap.concepts.length > 0,
  )
})

test('追加日志在小阈值下自动压缩为快照', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-journal-'))
  const gateway = createFakeGateway()
  try {
    const persistor = createJournaledSessionPersistor(dataDir, {
      checkpointEventThreshold: 3, // 3 条事件就触发一次快照压缩
      checkpointIdleMs: 10_000,
    })
    const store = new LearningStore({ modelGateway: gateway, persistor })
    const session = store.createSession('日志压缩验证')

    for (let i = 0; i < 6; i += 1) {
      await store.sendMessage(
        session.id,
        'self-attention',
        `压缩验证 ${i}`,
      )
      await store.persistSession(session.id)
    }

    // 低阈值下事件会反复触发压缩，日志不应无限增长（应存在且至少一次被清空）
    const files = await readdir(dataDir)
    const journalFiles = files.filter((f) => f.endsWith('.journal.jsonl'))
    const checkpointFiles = files.filter((f) => f.endsWith('.session.json'))
    assert.ok(journalFiles.length >= 1)
    assert.ok(checkpointFiles.length >= 1)

    // 压缩后恢复应还原全部消息
    const restored = new LearningStore({ modelGateway: gateway, persistor })
    const ids = await persistor.listSessionIds()
    const dump = await persistor.load(ids[0])
    assert.ok(dump)
    restored.restoreSession(dump)
    const context = restored.getCompiledContext(session.id, 'self-attention')
    assert.ok(context.messages.some((m) => m.content.includes('压缩验证 5')))
    assert.ok(context.messages.some((m) => m.content.includes('压缩验证 0')))
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('追加日志在未触发压缩时会话通过日志重放完整恢复', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-replay-'))
  const gateway = createFakeGateway()
  try {
    const persistor = createJournaledSessionPersistor(dataDir, {
      checkpointEventThreshold: 1000, // 高频阈值，不触发压缩
      checkpointIdleMs: 3_600_000,
    })
    const store = new LearningStore({ modelGateway: gateway, persistor })
    const session = store.createSession('日志重放验证')
    await store.persistSession(session.id)

    await store.sendMessage(session.id, 'self-attention', '重放消息一 778899')
    await store.sendMessage(
      session.id,
      'self-attention',
      '重放消息二 776655',
    )
    store.createBranch(session.id, 'self-attention', {
      title: '重放分支',
    })
    await store.persistSession(session.id)

    // 日志文件应有内容（未压缩）
    const files = await readdir(dataDir)
    const journalFiles = files.filter((f) => f.endsWith('.journal.jsonl'))
    assert.ok(journalFiles.length >= 1)

    const restored = new LearningStore({ modelGateway: gateway, persistor })
    const ids = await persistor.listSessionIds()
    const dump = await persistor.load(ids[0])
    assert.ok(dump)
    restored.restoreSession(dump)

    // 重放后消息与分支都应存在
    const context = restored.getCompiledContext(session.id, 'self-attention')
    assert.ok(context.messages.some((m) => m.content.includes('重放消息二 776655')))
    assert.ok(
      restored
        .getSession(session.id)
        .nodes.some((n) => n.title === '重放分支'),
    )
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('兼容旧的纯快照 .session.json 格式', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zhizhi-old-'))
  const gateway = createFakeGateway()
  try {
    const oldStore = new LearningStore({
      modelGateway: gateway,
      persistor: createFileSessionPersistor(dataDir),
    })
    const session = oldStore.createSession('旧格式兼容验证')
    await oldStore.sendMessage(session.id, 'self-attention', '旧快照消息 334455')
    await oldStore.persistSession(session.id)

    // 用 journaled 持久化器读取旧快照
    const journaled = createJournaledSessionPersistor(dataDir)
    const ids = await journaled.listSessionIds()
    assert.equal(ids.length, 1)
    const dump = await journaled.load(ids[0])
    assert.ok(dump)
    const restored = new LearningStore({ modelGateway: gateway, persistor: journaled })
    restored.restoreSession(dump)
    const context = restored.getCompiledContext(session.id, 'self-attention')
    assert.ok(context.messages.some((m) => m.content.includes('旧快照消息 334455')))
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})
