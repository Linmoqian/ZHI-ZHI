import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ContentStore } from '../src/contentStore.ts'
import { createFileSessionPersistor } from '../src/journal.ts'
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
