import { useMemo } from 'react'
import { renderMarkdown } from '../lib/renderMarkdown'

type MarkdownContentProps = {
  markdown: string
  /** 附加到容器上的额外 class。 */
  className?: string
}

/**
 * 安全渲染 markdown 文本。输入已被消毒，切勿绕过。
 * 模型回复为不可信内容，统一由此组件渲染。
 */
export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])
  if (!html) {
    return null
  }
  return (
    <div
      className={`markdown-body${className ? ` ${className}` : ''}`}
      // eslint-disable-next-line react/no-danger -- renderMarkdown 已消毒
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
