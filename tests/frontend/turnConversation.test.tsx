import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TurnConversation } from '../../app/src/components/TurnConversation'

beforeAll(() => {
  // jsdom 未实现 scrollIntoView，组件 effect 会调用它
  Element.prototype.scrollIntoView = vi.fn()
})

/** 构造测试回合。 */
function turn(
  id: string,
  parentId: string | null,
  user = `问题-${id}`,
  assistant = `回复-${id}`,
) {
  return {
    id,
    parentId,
    userContent: user,
    assistantContent: assistant,
    createdAt: '2025-01-01T00:00:00Z',
  }
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    turns: [turn('root', null)],
    activeLeafId: 'root',
    draftMode: false,
    isGenerating: false,
    forkParentId: null,
    onSendMessage: vi.fn(),
    onForkTurn: vi.fn(),
    onBeginFork: vi.fn(),
    onCancelFork: vi.fn(),
    ...overrides,
  }
}

/** 含子回合的双回合对话（activeLeaf 指向最后，使根回合带分叉按钮）。 */
function forkedProps(overrides: Record<string, unknown> = {}) {
  return baseProps({
    turns: [turn('root', null, '根问题'), turn('a', 'root', '子问题')],
    activeLeafId: 'a',
    ...overrides,
  })
}

describe('TurnConversation 分叉交互', () => {
  it('点击分叉按钮触发 onBeginFork，不弹系统提示框', async () => {
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockImplementation(() => null)
    const props = forkedProps()
    render(<TurnConversation {...(props as never)} />)

    await userEvent.click(
      screen.getByRole('button', { name: '从此处分叉新支线' }),
    )
    expect(props.onBeginFork).toHaveBeenCalledWith('root')
    expect(props.onForkTurn).not.toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  it('待定分叉态下输入框提示为「新链生长」', () => {
    render(
      <TurnConversation
        {...(baseProps({ forkParentId: 'root' }) as never)}
      />,
    )
    const textarea = screen.getByLabelText('新链生长，输入新问题')
    expect(textarea.placeholder).toContain('新链生长')
  })

  it('待定分叉态提交走 onForkTurn 且带上父回合', async () => {
    const props = baseProps({ forkParentId: 'root' })
    render(<TurnConversation {...(props as never)} />)

    await userEvent.type(
      screen.getByLabelText('新链生长，输入新问题'),
      '新问题',
    )
    fireEvent.submit(
      screen.getByLabelText('新链生长，输入新问题').closest('form')!,
    )
    expect(props.onForkTurn).toHaveBeenCalledWith('root', '新问题')
    expect(props.onSendMessage).not.toHaveBeenCalled()
  })

  it('普通态提交走 onSendMessage', async () => {
    const props = baseProps()
    render(<TurnConversation {...(props as never)} />)
    await userEvent.type(
      screen.getByLabelText('继续对话'),
      '继续追问',
    )
    fireEvent.submit(screen.getByLabelText('继续对话').closest('form')!)
    expect(props.onSendMessage).toHaveBeenCalledWith('继续追问')
    expect(props.onForkTurn).not.toHaveBeenCalled()
  })

  it('待定分叉态按 Esc 触发 onCancelFork', async () => {
    const props = baseProps({ forkParentId: 'root' })
    render(<TurnConversation {...(props as never)} />)
    fireEvent.keyDown(
      screen.getByLabelText('新链生长，输入新问题'),
      { key: 'Escape' },
    )
    expect(props.onCancelFork).toHaveBeenCalled()
  })

  it('点击「取消分叉」按钮触发 onCancelFork', async () => {
    const props = baseProps({ forkParentId: 'root' })
    render(<TurnConversation {...(props as never)} />)
    await userEvent.click(
      screen.getByRole('button', { name: '取消分叉' }),
    )
    expect(props.onCancelFork).toHaveBeenCalled()
  })
})
