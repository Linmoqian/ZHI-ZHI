import type { LearningNode, LearningSession } from '../../shared/contracts.ts'

/**
 * 个人知识地图：由学习会话中的节点派生出的概念与概念间关联。
 * 概念以节点标题为主标签，关联依据节点父子关系（知识主线）推导，
 * 便于前端沉淀“概念如何连接”的图谱视图。
 */
export type KnowledgeConcept = {
  id: string
  label: string
  sourceNodeIds: string[]
}

export type KnowledgeLink = {
  source: string
  target: string
}

export const EMPTY_KNOWLEDGE_MAP: KnowledgeMap = {
  concepts: [],
  links: [],
}

export type KnowledgeMap = {
  concepts: KnowledgeConcept[]
  links: KnowledgeLink[]
}

/** 从学习会话构建知识地图。每个节点产生一个概念，父子关系产生概念连线。 */
export function buildKnowledgeMap(session: LearningSession): KnowledgeMap {
  const conceptByNode = new Map<string, KnowledgeConcept>()
  const links: KnowledgeLink[] = []

  for (const node of session.nodes) {
    const concept = toConcept(node)
    conceptByNode.set(node.id, concept)
  }

  // 父子关系 → 概念连线（知识主线）
  for (const node of session.nodes) {
    if (!node.parentId) {
      continue
    }
    const parentConcept = conceptByNode.get(node.parentId)
    const childConcept = conceptByNode.get(node.id)
    if (parentConcept && childConcept && parentConcept.id !== childConcept.id) {
      addUniqueLink(links, parentConcept.id, childConcept.id)
    }
  }

  // summary 中引用了其他节点标题时，也建立概念连线
  for (const node of session.nodes) {
    for (const other of session.nodes) {
      if (other.id === node.id) {
        continue
      }
      if (node.summary.includes(other.title)) {
        const source = conceptByNode.get(node.id)
        const target = conceptByNode.get(other.id)
        if (source && target && source.id !== target.id) {
          addUniqueLink(links, source.id, target.id)
        }
      }
    }
  }

  return {
    concepts: [...conceptByNode.values()],
    links,
  }
}

function toConcept(node: LearningNode): KnowledgeConcept {
  const label = node.title.trim() || node.id
  return {
    id: `concept-${node.id}`,
    label,
    sourceNodeIds: [node.id],
  }
}

function addUniqueLink(
  links: KnowledgeLink[],
  source: string,
  target: string,
) {
  if (links.some((link) => link.source === source && link.target === target)) {
    return
  }
  links.push({ source, target })
}
