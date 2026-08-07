import assert from 'node:assert/strict'
import test from 'node:test'
import { ContentStore } from '../src/contentStore.ts'
import type { ModelGateway } from '../src/modelGateway.ts'
import { TurnSessionStore } from '../src/turnStore.ts'

function createFakeGateway(reply = '测试回复'): ModelGateway {
  return {
    complete: () => Promise.resolve(reply),
    summarize: () => Promise.resolve('一句概括'),
  }
}

test('创建会话生成根回合，topic 取根回合 user 输入', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '注意力机制',
    '什么是注意力机制？',
    contentStore,
    { modelGateway: createFakeGateway() },
  )

  assert.equal(store.topic, '注意力机制')
  assert.ok(store.rootId)
  const root = store.listTurns()[0]
  assert.equal(root.parentId, null)
  assert.equal(
    contentStore.get(root.userContentHash),
    '什么是注意力机制？',
  )
})

test('追加回合沿主线生长，上下文为根到叶的纯净路径', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '主线',
    '第一轮问题',
    contentStore,
    { modelGateway: createFakeGateway('第一轮回复') },
  )
  const root = store.rootId!
  const second = await store.appendTurn({
    parentId: root,
    userContent: '第二轮问题',
  })

  const context = store.compileContext(second.id)
  assert.equal(context.turns.length, 2)
  assert.equal(context.turns[0].userContent, '第一轮问题')
  assert.equal(context.turns[1].userContent, '第二轮问题')
})

test('分叉后两条支线互不可见（分叉即隔离）', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '隔离',
    '根问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  const root = store.rootId!

  const branchA = await store.appendTurn({
    parentId: root,
    userContent: '支线 A 私有内容 314159',
  })
  const branchB = await store.appendTurn({
    parentId: root,
    userContent: '支线 B 私有内容 271828',
  })

  const contextA = store.compileContext(branchA.id)
  const contextB = store.compileContext(branchB.id)

  // 支线 A 看不到支线 B
  assert.ok(
    contextA.turns.every(
      (t) => !t.userContent.includes('支线 B 私有内容 271828'),
    ),
  )
  // 支线 B 看不到支线 A
  assert.ok(
    contextB.turns.every(
      (t) => !t.userContent.includes('支线 A 私有内容 314159'),
    ),
  )
  // 两条支线共享根回合
  assert.equal(contextA.turns[0].id, contextB.turns[0].id)
})

test('内容寻址去重：相同内容只存一个 Blob', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '去重',
    '相同的问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  const sizeBefore = contentStore.size
  await store.appendTurn({
    parentId: store.rootId!,
    userContent: '相同的问题',
  })
  // 用户输入「相同的问题」与根回合相同，应命中去重
  assert.equal(contentStore.size, sizeBefore)
})

test('序列化与恢复保留完整回合树', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '持久化',
    '根问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  const child = await store.appendTurn({
    parentId: store.rootId!,
    userContent: '子问题',
  })
  const dump = store.serialize()

  const restoredContentStore = new ContentStore()
  const restored = TurnSessionStore.restore(
    dump,
    restoredContentStore,
    { modelGateway: createFakeGateway() },
  )

  assert.equal(restored.listTurns().length, 2)
  const restoredChild = restored.listTurns().find((t) => t.parentId !== null)
  assert.ok(restoredChild)
  assert.equal(restoredChild!.id, child.id)
  const context = restored.compileContext(child.id)
  assert.equal(context.turns.length, 2)
})

test('编辑回合内容更新对应 Blob 引用', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '编辑',
    '原始问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  const root = store.rootId!
  const originalHash = store.listTurns().find((t) => t.id === root)!
    .userContentHash
  const updated = store.updateTurn(root, { userContent: '修改后的问题' })

  assert.notEqual(updated.userContentHash, originalHash)
  const context = store.compileContext(root)
  assert.equal(context.turns[0].userContent, '修改后的问题')
})

test('不存在的回合抛出 404', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '错误',
    '问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  assert.throws(
    () => store.compileContext('不存在'),
    { code: 'TURN_NOT_FOUND' },
  )
})
