// 回合树前端工具：布局计算、路径查找、派生索引。
//
// 回合树是一棵多叉树，每个回合 = 一次用户输入 + 一次模型输出。
// 地图 = 树本身；布局坐标从树结构自动派生（深度定列、分支序定行）。

import type { TurnDTO } from '../types'

/** 画布布局参数。 */
export const LAYOUT = {
  /** 列间距（每个深度的水平间隔）。 */
  columnWidth: 200,
  /** 行间距（同层兄弟的垂直间隔）。 */
  rowHeight: 120,
  /** 画布原点偏移。 */
  originX: 80,
  originY: 60,
  /** 根节点列（深度 0）。 */
  rootColumn: 0,
} as const

/** 带布局坐标的回合视图模型。 */
export type PositionedTurn = TurnDTO & {
  /** 树深度（根 = 0）。 */
  depth: number
  /** 画布坐标。 */
  x: number
  y: number
  /** 是否为叶回合（无子回合）。 */
  isLeaf: boolean
}

/** 子索引：parentId → 子回合列表。 */
export type ChildIndex = Map<string | null, TurnDTO[]>

/** 从回合列表构建子索引。 */
export function buildChildIndex(turns: TurnDTO[]): ChildIndex {
  const index: ChildIndex = new Map()
  for (const turn of turns) {
    const siblings = index.get(turn.parentId) ?? []
    siblings.push(turn)
    index.set(turn.parentId, siblings)
  }
  return index
}

/** 找根回合（parentId === null）。 */
export function findRoot(turns: TurnDTO[]): TurnDTO | null {
  return turns.find((t) => t.parentId === null) ?? null
}

/** 找某回合到根的路径（叶 → 根）。 */
export function pathToRoot(turns: TurnDTO[], leafId: string): TurnDTO[] {
  const byId = new Map(turns.map((t) => [t.id, t]))
  const path: TurnDTO[] = []
  const visited = new Set<string>()
  let cursor = byId.get(leafId)
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id)
    path.push(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return path
}

/** 找某回合到根的路径（根 → 叶，时间顺序）。 */
export function pathFromRoot(turns: TurnDTO[], leafId: string): TurnDTO[] {
  return pathToRoot(turns, leafId).reverse()
}

/** 返回某回合的所有子回合。 */
export function childrenOf(
  index: ChildIndex,
  parentId: string,
): TurnDTO[] {
  return index.get(parentId) ?? []
}

/** 返回所有叶回合（无子回合的回合）。 */
export function findLeaves(turns: TurnDTO[], index: ChildIndex): TurnDTO[] {
  return turns.filter((t) => childrenOf(index, t.id).length === 0)
}

/**
 * 计算画布布局：深度定列（x），按 DFS 遍历顺序定行（y）。
 * 兄弟回合垂直排列，父子间保持列对齐，子树向下扩展。
 */
export function computeLayout(turns: TurnDTO[]): PositionedTurn[] {
  const index = buildChildIndex(turns)
  const root = findRoot(turns)
  const result: PositionedTurn[] = []
  let nextRow = 0

  // DFS 前序遍历：每个子树占连续若干行，根节点取子树首行。
  const place = (turn: TurnDTO, depth: number): number => {
    const kids = childrenOf(index, turn.id)
    let row: number

    if (kids.length === 0) {
      row = nextRow
      nextRow += 1
    } else {
      row = place(kids[0], depth + 1)
      for (let i = 1; i < kids.length; i += 1) {
        place(kids[i], depth + 1)
      }
    }

    result.push({
      ...turn,
      depth,
      x: LAYOUT.originX + depth * LAYOUT.columnWidth,
      y: LAYOUT.originY + row * LAYOUT.rowHeight,
      isLeaf: kids.length === 0,
    })
    return row
  }

  if (root) {
    place(root, 0)
  }
  // 孤立回合（无根链）兜底铺在末尾
  for (const turn of turns) {
    if (!result.some((r) => r.id === turn.id)) {
      result.push({
        ...turn,
        depth: 0,
        x: LAYOUT.originX,
        y: LAYOUT.originY + nextRow * LAYOUT.rowHeight,
        isLeaf: childrenOf(index, turn.id).length === 0,
      })
      nextRow += 1
    }
  }

  return result
}

/** 按深度循环派生色调（替代旧 NodeTone 的自动版本）。 */
export const TURN_TONES = [
  'blue',
  'green',
  'purple',
  'orange',
] as const
export type TurnTone = (typeof TURN_TONES)[number]

export function toneForDepth(depth: number): TurnTone {
  return TURN_TONES[depth % TURN_TONES.length]
}
