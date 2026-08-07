// Markdown 渲染工具：marked 解析 + DOMPurify 消毒。
//
// 模型回复属于不可信外部输入，必须经过消毒后再注入 DOM，杜绝 XSS。
// 对外只暴露渲染后的安全 HTML，调用方用 dangerouslySetInnerHTML 展示。

import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 全局注册：所有链接强制新窗口打开，且不传递 opener（学习文档外部链接安全）。
// 通过 afterSanitizeAttributes 在消毒后补上 target，避免被默认策略剥离。
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName.toLowerCase() === 'a') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** 渲染 markdown，返回已消毒的安全 HTML；空输入返回空串。 */
export function renderMarkdown(markdown: string): string {
  const source = markdown.trim()
  if (!source) {
    return ''
  }

  const rawHtml = marked.parse(source, {
    async: false,
    gfm: true,
    breaks: true, // 单换行也渲染为换行，贴合对话场景
  }) as string

  return DOMPurify.sanitize(rawHtml)
}
