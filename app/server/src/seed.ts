import type {
  ContextMode,
  LearningNode,
  MessageRole,
} from '../../shared/contracts.ts'

export type SeedMessage = {
  role: MessageRole
  content: string
}

export type SeedNode = LearningNode & {
  messages: SeedMessage[]
}

const topicLabel = (topic: string) =>
  topic.length > 18 ? `${topic.slice(0, 18)}…` : topic

export function createSeedNodes(topic: string): SeedNode[] {
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
      messages: [
        {
          role: 'assistant',
          content: `我们会围绕“${topic}”建立一条清晰的学习主线。你可以随时从某个概念创建分支，探索完再把结论带回来。`,
        },
      ],
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
      messages: [
        {
          role: 'assistant',
          content:
            '先确认问题的背景：我们真正想解释的不是一个术语，而是它解决了什么限制，以及为什么旧方法不够好。',
        },
      ],
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
      messages: [
        {
          role: 'assistant',
          content:
            '核心概念可以拆成三层：输入是什么、信息如何发生关联、关联后的信息如何被重新组织。',
        },
      ],
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
      messages: [],
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
      messages: [
        {
          role: 'user',
          content: `我想从直觉开始理解：${topic}`,
        },
        {
          role: 'assistant',
          content:
            '可以把它想成一次“带着问题阅读”：不是平均记住所有内容，而是根据当前需要，主动找到最相关的信息并重新组合。接下来我们可以用一个具体例子验证这个直觉。',
        },
      ],
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
      messages: [
        {
          role: 'assistant',
          content:
            '这个分支与父节点原始对话隔离，适合放心追问暂时不确定的细节。你的探索不会打乱学习主线。',
        },
      ],
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
      messages: [
        {
          role: 'assistant',
          content:
            '想象你在一间热闹的教室里寻找同伴的回答：当前问题决定你会注意谁，而不是所有声音都同样重要。',
        },
      ],
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
      messages: [],
    },
  ]
}

export function normalizeContextMode(mode: unknown): ContextMode {
  return mode === 'isolated' ? 'isolated' : 'inherit'
}
