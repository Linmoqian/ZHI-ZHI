import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../app/src/lib/renderMarkdown'

describe('renderMarkdown', () => {
  it('渲染标题与段落', () => {
    const html = renderMarkdown('# 标题\n\n正文文本')
    expect(html).toContain('<h1')
    expect(html).toContain('>标题<')
    expect(html).toContain('<p')
  })

  it('渲染代码块', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
    expect(html).toContain('const x = 1')
  })

  it('渲染表格（GFM）', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('<td>1</td>')
  })

  it('空输入返回空串', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })

  it('危险脚本标签被消毒移除', () => {
    const html = renderMarkdown('<script>alert(1)</script>安全文字')
    expect(html).not.toContain('<script')
    expect(html).toContain('安全文字')
  })

  it('事件处理器属性被剥离（XSS 防护）', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onerror=')
  })

  it('链接强制新窗口打开且带 noopener', () => {
    const html = renderMarkdown('[文档](https://example.com)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('href="https://example.com"')
  })

  it('javascript: 链接被消毒', () => {
    const html = renderMarkdown('[危险](javascript:alert(1))')
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i)
  })

  it('列表与引用渲染', () => {
    const html = renderMarkdown('- 甲\n- 乙\n\n> 引用内容')
    expect(html).toContain('<ul>')
    expect(html).toContain('<blockquote')
    expect(html).toContain('引用内容')
  })
})
