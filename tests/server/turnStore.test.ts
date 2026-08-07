import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ContentStore } from '../../app/server/src/contentStore.ts'
import type { ModelGateway } from '../../app/server/src/modelGateway.ts'
import { TurnSessionStore } from '../../app/server/src/turnStore.ts'
import { createTurnJournaledPersistor } from '../../app/server/src/turnJournal.ts'

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

test('persist 后通过 persistor.load 能完整恢复会话', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'zhizhi-turn-'))
  const persistor = createTurnJournaledPersistor(tmpDir)
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '持久化全链路',
    '根问题',
    contentStore,
    { modelGateway: createFakeGateway('根回复'), persistor },
  )
  await store.appendTurn({
    parentId: store.rootId!,
    userContent: '跟进问题',
  })
  await store.persist()

  const dump = await persistor.load(store.id)
  assert.ok(dump)
  assert.equal(dump!.turns.length, 2)

  // 从 dump 恢复为新 store，验证内容可达
  const restored = TurnSessionStore.restore(
    dump!,
    new ContentStore(),
    { modelGateway: createFakeGateway() },
  )
  const leaf = restored.listTurns().find((t) => t.parentId !== null)!
  const context = restored.compileContext(leaf.id)
  assert.equal(context.turns.length, 2)
  assert.equal(context.turns[1].userContent, '跟进问题')
  assert.equal(context.turns[0].assistantContent, '根回复')
})

test('未配置 persistor 时 persist 为空操作', async () => {
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '空持久化',
    '问题',
    contentStore,
    { modelGateway: createFakeGateway() },
  )
  // 不应抛错
  await store.persist()
  assert.equal(store.listTurns().length, 1)
})

test('编辑回合产生 turn_updated 事件且可恢复', async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'zhizhi-turn-'))
  const persistor = createTurnJournaledPersistor(tmpDir)
  const contentStore = new ContentStore()
  const store = await TurnSessionStore.create(
    '编辑持久化',
    '原始问题',
    contentStore,
    { modelGateway: createFakeGateway(), persistor },
  )
  store.updateTurn(store.rootId!, { userContent: '修改后的问题' })
  await store.persist()

  const dump = await persistor.load(store.id)
  assert.ok(dump)
  const restored = TurnSessionStore.restore(
    dump!,
    new ContentStore(),
    { modelGateway: createFakeGateway() },
  )
  const context = restored.compileContext(restored.rootId!)
  assert.equal(context.turns[0].userContent, '修改后的问题')
})
