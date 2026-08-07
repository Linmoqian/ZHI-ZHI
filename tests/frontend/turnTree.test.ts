import { describe, expect, it } from 'vitest'
import type { TurnDTO } from '../../app/src/types'
import {
  buildChildIndex,
  childrenOf,
  computeLayout,
  findLeaves,
  findRoot,
  LAYOUT,
  pathFromRoot,
  pathToRoot,
  toneForDepth,
  TURN_TONES,
} from '../../app/src/lib/turnTree'

/** 构造一个回合的辅助函数。 */
function turn(
  id: string,
  parentId: string | null,
  user = `问题-${id}`,
  assistant = `回复-${id}`,
): TurnDTO {
  return {
    id,
    parentId,
    userContent: user,
    assistantContent: assistant,
    createdAt: '2025-01-01T00:00:00Z',
  }
}

describe('buildChildIndex / childrenOf', () => {
  it('按 parentId 分组子回合', () => {
    const turns = [
      turn('root', null),
      turn('a', 'root'),
      turn('b', 'root'),
      turn('c', 'a'),
    ]
    const index = buildChildIndex(turns)

    expect(childrenOf(index, 'root')).toHaveLength(2)
    expect(childrenOf(index, 'a')).toHaveLength(1)
    expect(childrenOf(index, 'a')[0].id).toBe('c')
  })

  it('无子回合时返回空数组', () => {
    const index = buildChildIndex([turn('root', null)])
    expect(childrenOf(index, 'root')).toEqual([])
  })

  it('根回合归入 null 键', () => {
    const index = buildChildIndex([turn('root', null)])
    expect(index.get(null)).toHaveLength(1)
  })
})

describe('findRoot', () => {
  it('返回 parentId 为 null 的回合', () => {
    const turns = [turn('a', 'root'), turn('root', null)]
    expect(findRoot(turns)?.id).toBe('root')
  })

  it('无根回合时返回 null', () => {
    expect(findRoot([turn('a', 'root')])).toBeNull()
  })
})

describe('pathToRoot / pathFromRoot', () => {
  const tree = [
    turn('root', null),
    turn('a', 'root'),
    turn('b', 'a'),
    turn('c', 'root'), // 与 a/b 平行的另一支线
  ]

  it('pathToRoot 返回叶→根路径', () => {
    const path = pathToRoot(tree, 'b')
    expect(path.map((t) => t.id)).toEqual(['b', 'a', 'root'])
  })

  it('pathFromRoot 返回根→叶时间序', () => {
    const path = pathFromRoot(tree, 'b')
    expect(path.map((t) => t.id)).toEqual(['root', 'a', 'b'])
  })

  it('分叉支线互不交叉（c 不经过 a/b）', () => {
    const pathC = pathFromRoot(tree, 'c')
    expect(pathC.map((t) => t.id)).toEqual(['root', 'c'])
  })

  it('根回合的路径只含自身', () => {
    expect(pathFromRoot(tree, 'root')).toHaveLength(1)
  })

  it('处理循环引用不无限递归', () => {
    // 构造一个循环：a→b→a
    const cyclic = [turn('a', 'b'), turn('b', 'a')]
    const path = pathToRoot(cyclic, 'a')
    // 遇到已访问节点即停止，不会无限循环
    expect(path.length).toBeLessThanOrEqual(2)
  })
})

describe('findLeaves', () => {
  it('返回所有无子回合的回合', () => {
    const turns = [
      turn('root', null),
      turn('a', 'root'),
      turn('b', 'a'),
      turn('c', 'root'),
    ]
    const index = buildChildIndex(turns)
    const leaves = findLeaves(turns, index)
    expect(leaves.map((l) => l.id).sort()).toEqual(['b', 'c'])
  })
})

describe('computeLayout', () => {
  it('深度决定 x 坐标，根在最左侧', () => {
    const turns = [turn('root', null), turn('child', 'root')]
    const layout = computeLayout(turns)
    const root = layout.find((t) => t.id === 'root')!
    const child = layout.find((t) => t.id === 'child')!

    expect(root.x).toBe(LAYOUT.originX)
    expect(child.x).toBe(LAYOUT.originX + LAYOUT.columnWidth)
    expect(child.depth).toBe(1)
  })

  it('叶回合标记 isLeaf=true，非叶为 false', () => {
    const turns = [turn('root', null), turn('child', 'root')]
    const layout = computeLayout(turns)
    expect(layout.find((t) => t.id === 'root')!.isLeaf).toBe(false)
    expect(layout.find((t) => t.id === 'child')!.isLeaf).toBe(true)
  })

  it('兄弟回合各自占独立行（y 不同）', () => {
    const turns = [
      turn('root', null),
      turn('a', 'root'),
      turn('b', 'root'),
    ]
    const layout = computeLayout(turns)
    const a = layout.find((t) => t.id === 'a')!
    const b = layout.find((t) => t.id === 'b')!
    expect(a.y).not.toBe(b.y)
  })

  it('空列表返回空布局', () => {
    expect(computeLayout([])).toEqual([])
  })

  it('保留回合内容字段', () => {
    const turns = [turn('root', null, '我的问题', '模型回复')]
    const layout = computeLayout(turns)
    expect(layout[0].userContent).toBe('我的问题')
    expect(layout[0].assistantContent).toBe('模型回复')
  })
})

describe('toneForDepth', () => {
  it('按深度循环取色调', () => {
    expect(toneForDepth(0)).toBe(TURN_TONES[0])
    expect(toneForDepth(1)).toBe(TURN_TONES[1])
    expect(toneForDepth(TURN_TONES.length)).toBe(TURN_TONES[0])
    expect(toneForDepth(TURN_TONES.length + 1)).toBe(TURN_TONES[1])
  })
})
