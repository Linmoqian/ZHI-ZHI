import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownContent } from '../../app/src/components/MarkdownContent'

describe('MarkdownContent', () => {
  it('渲染 markdown 为可读内容', () => {
    render(<MarkdownContent markdown="**重点** 与 普通" />)
    // 粗体被拆成 strong，正文与粗体同段；用正则匹配整段文本
    const paragraph = screen.getByText((content) => content.includes('普通'))
    expect(paragraph).toBeInTheDocument()
    const container = paragraph.closest('div')
    expect(container?.className).toContain('markdown-body')
    // 粗体渲染为 <strong>
    expect(screen.getByText(/重点/).closest('strong')).not.toBeNull()
  })

  it('空内容不渲染容器', () => {
    const { container } = render(<MarkdownContent markdown="" />)
    expect(container.querySelector('.markdown-body')).toBeNull()
  })

  it('渲染代码块内容', () => {
    render(<MarkdownContent markdown={'```js\nlet a=1\n```'} />)
    expect(screen.getByText('let a=1')).toBeInTheDocument()
  })

  it('追加自定义 className', () => {
    const { container } = render(
      <MarkdownContent markdown="x" className="message__text" />,
    )
    expect(
      container.querySelector('.markdown-body.message__text'),
    ).not.toBeNull()
  })
})
