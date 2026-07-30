import type { LearningNode, Message, RecentProject } from './types'

export const DEFAULT_TOPIC = 'Transformer 为什么需要注意力机制？'

export const RECENT_PROJECTS: RecentProject[] = [
  {
    id: 'transformer',
    title: 'Transformer 为什么需要注意力机制？',
    category: '人工智能',
    tone: 'blue',
    icon: 'brain',
    progress: 7,
  },
  {
    id: 'neural-network',
    title: '神经网络是如何学会识别的？',
    category: '机器学习',
    tone: 'green',
    icon: 'leaf',
    progress: 5,
  },
  {
    id: 'quantum',
    title: '量子世界的基本规则是什么？',
    category: '现代物理',
    tone: 'purple',
    icon: 'atom',
    progress: 6,
  },
]

const topicLabel = (topic: string) =>
  topic.length > 18 ? `${topic.slice(0, 18)}…` : topic

export function createInitialNodes(topic: string): LearningNode[] {
  return [
    {
      id: 'root',
      parentId: null,
      title: topicLabel(topic),
      summary: `围绕“${topic}”建立的学习主线。`,
      status: 'exploring',
      tone: 'blue',
      position: { x: 96, y: 16 },
      contextMode: 'inherit',
    },
    {
      id: 'background',
      parentId: 'root',
      title: '问题背景',
      summary: '明确问题发生的背景、目标和已知条件。',
      status: 'mastered',
      tone: 'green',
      position: { x: -12, y: 144 },
      contextMode: 'inherit',
    },
    {
      id: 'core-concept',
      parentId: 'root',
      title: '核心概念',
      summary: '拆解这个主题中最重要的概念关系。',
      status: 'exploring',
      tone: 'blue',
      position: { x: 174, y: 144 },
      contextMode: 'inherit',
    },
    {
      id: 'prior-knowledge',
      parentId: 'background',
      title: '前置知识',
      summary: '整理继续学习需要掌握的基础知识。',
      status: 'mastered',
      tone: 'green',
      position: { x: -28, y: 284 },
      contextMode: 'inherit',
    },
    {
      id: 'self-attention',
      parentId: 'core-concept',
      title: '概念拆解',
      summary: '从直觉、结构和例子三个层面理解核心机制。',
      status: 'current',
      tone: 'blue',
      position: { x: 94, y: 284 },
      contextMode: 'inherit',
    },
    {
      id: 'open-question',
      parentId: 'core-concept',
      title: '待解决疑问',
      summary: '记录目前仍没有完全理解的问题。',
      status: 'exploring',
      tone: 'orange',
      position: { x: 220, y: 284 },
      contextMode: 'isolated',
    },
    {
      id: 'analogy',
      parentId: 'self-attention',
      title: '直觉类比',
      summary: '通过具体场景建立可复用的直觉。',
      status: 'exploring',
      tone: 'purple',
      position: { x: 48, y: 426 },
      contextMode: 'inherit',
    },
    {
      id: 'example',
      parentId: 'self-attention',
      title: '动手示例',
      summary: '用一个最小例子检查自己的理解。',
      status: 'locked',
      tone: 'gray',
      position: { x: 192, y: 426 },
      contextMode: 'inherit',
    },
  ]
}

export function createInitialMessages(topic: string): Message[] {
  const timestamp = '刚刚'

  return [
    {
      id: 'message-root',
      nodeId: 'root',
      role: 'assistant',
      content: `我们会围绕“${topic}”建立一条清晰的学习主线。你可以随时从某个概念创建分支，探索完再把结论带回来。`,
      createdAt: timestamp,
    },
    {
      id: 'message-background',
      nodeId: 'background',
      role: 'assistant',
      content:
        '先确认问题的背景：我们真正想解释的不是一个术语，而是它解决了什么限制，以及为什么旧方法不够好。',
      createdAt: timestamp,
    },
    {
      id: 'message-core',
      nodeId: 'core-concept',
      role: 'assistant',
      content:
        '核心概念可以拆成三层：输入是什么、信息如何发生关联、关联后的信息如何被重新组织。',
      createdAt: timestamp,
    },
    {
      id: 'message-current-user',
      nodeId: 'self-attention',
      role: 'user',
      content: `我想从直觉开始理解：${topic}`,
      createdAt: timestamp,
    },
    {
      id: 'message-current-assistant',
      nodeId: 'self-attention',
      role: 'assistant',
      content:
        '可以把它想成一次“带着问题阅读”：不是平均记住所有内容，而是根据当前需要，主动找到最相关的信息并重新组合。接下来我们可以用一个具体例子验证这个直觉。',
      createdAt: timestamp,
    },
    {
      id: 'message-open-question',
      nodeId: 'open-question',
      role: 'assistant',
      content:
        '这个分支与同级上下文隔离，适合放心追问暂时不确定的细节。你的探索不会打乱学习主线。',
      createdAt: timestamp,
    },
    {
      id: 'message-analogy',
      nodeId: 'analogy',
      role: 'assistant',
      content:
        '想象你在一间热闹的教室里寻找同伴的回答：当前问题决定你会注意谁，而不是所有声音都同样重要。',
      createdAt: timestamp,
    },
  ]
}
