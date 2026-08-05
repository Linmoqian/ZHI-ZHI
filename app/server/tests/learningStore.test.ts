import assert from 'node:assert/strict'
import test from 'node:test'
import { ContentStore } from '../src/contentStore.ts'
import { LearningStore } from '../src/learningStore.ts'
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
