import { describe, expect, it } from 'vitest'
import { fireEvent, renderWithProviders, screen } from '../../../test/render'
import type { ConversationMessage } from '../../../types/conversationTypes'
import ToolOperationGroup from '../ToolOperationGroup'

function toolMsg(partial: Partial<ConversationMessage> & Pick<ConversationMessage, 'id' | 'role'>): ConversationMessage {
  return {
    sessionId: 's1',
    content: '',
    timestamp: '2026-07-29T10:00:00.000Z',
    ...partial,
  }
}

const liveTools: ConversationMessage[] = [
  toolMsg({
    id: 'use-1',
    role: 'tool_use',
    toolUseId: 'call-1',
    toolName: 'Bash',
    toolInput: { command: 'ls frontend' },
    content: 'ls frontend',
    isDelta: true,
  }),
  toolMsg({
    id: 'result-1',
    role: 'tool_result',
    toolUseId: 'call-1',
    toolName: 'Bash',
    toolResult: 'App.tsx\n',
    content: 'App.tsx\n',
    isDelta: true,
  }),
  toolMsg({
    id: 'use-2',
    role: 'tool_use',
    toolUseId: 'call-2',
    toolName: 'Grep',
    toolInput: { pattern: 'expanded' },
    content: 'grep expanded',
    isDelta: true,
  }),
]

describe('ToolOperationGroup', () => {
  it('stays collapsed while active / in-flight by default', () => {
    renderWithProviders(<ToolOperationGroup messages={liveTools} isActive />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/正在执行/)).toBeInTheDocument()
    expect(screen.getByText(/最近：执行中/)).toBeInTheDocument()
    expect(screen.queryByText('Bash')).not.toBeInTheDocument()
    expect(screen.queryByText('Grep')).not.toBeInTheDocument()
  })

  it('does not label settled tool-only history as 执行中 without isDelta', () => {
    const settledOpen = [
      toolMsg({
        id: 'use-1',
        role: 'tool_use',
        toolUseId: 'call-1',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        content: 'ls',
      }),
    ]
    renderWithProviders(<ToolOperationGroup messages={settledOpen} isActive={false} />)
    expect(screen.getByText(/执行了/)).toBeInTheDocument()
    expect(screen.getByText(/最近：已发起/)).toBeInTheDocument()
    expect(screen.queryByText(/最近：执行中/)).not.toBeInTheDocument()
  })

  it('treats partial-only open tool_use as 执行中 (agent:stream may omit isDelta)', () => {
    const partialOpen = [
      toolMsg({
        id: 'use-1',
        role: 'tool_use',
        toolUseId: 'call-1',
        toolName: 'Bash',
        toolInput: { command: 'ls frontend' },
        content: 'ls frontend',
        partial: true,
      }),
    ]
    renderWithProviders(<ToolOperationGroup messages={partialOpen} isActive />)
    expect(screen.getByText(/正在执行/)).toBeInTheDocument()
    expect(screen.getByText(/最近：执行中/)).toBeInTheDocument()
  })

  it('treats partial tool_result as live output not final result', () => {
    const livePartial = [
      toolMsg({
        id: 'use-1',
        role: 'tool_use',
        toolUseId: 'call-1',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        content: 'ls',
        partial: true,
      }),
      toolMsg({
        id: 'result-1',
        role: 'tool_result',
        toolUseId: 'call-1',
        toolName: 'Bash',
        toolResult: 'App.tsx\n',
        content: 'App.tsx\n',
        partial: true,
      }),
    ]
    renderWithProviders(<ToolOperationGroup messages={livePartial} isActive />)
    expect(screen.getByText(/最近：执行中/)).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('stays collapsed for finished history groups by default', () => {
    const finished = liveTools.map(message => (
      message.role === 'tool_result'
        ? { ...message, isDelta: false }
        : message
    ))

    renderWithProviders(<ToolOperationGroup messages={finished} isActive={false} />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/执行了/)).toBeInTheDocument()
    expect(screen.getByText(/最近：/)).toBeInTheDocument()
    expect(screen.queryByText('Grep')).not.toBeInTheDocument()
  })

  it('stays collapsed when all tools settled even if isActive is still true', () => {
    // Mid-turn: tools finished but session still streaming — must not auto-open.
    const finished = [
      toolMsg({
        id: 'use-1',
        role: 'tool_use',
        toolUseId: 'call-1',
        toolName: 'list_agents',
        toolInput: { parentSessionId: 'p1' },
        content: '',
      }),
      toolMsg({
        id: 'result-1',
        role: 'tool_result',
        toolUseId: 'call-1',
        toolName: 'list_agents',
        toolResult: '[]',
        content: '[]',
        isDelta: false,
      }),
    ]

    renderWithProviders(<ToolOperationGroup messages={finished} isActive />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/正在执行/)).toBeInTheDocument()
    expect(screen.getByText(/最近：/)).toBeInTheDocument()
    expect(screen.queryByText('输入参数')).not.toBeInTheDocument()
  })

  it('settled tool cards inside an expanded group stay collapsed until clicked', () => {
    const finished = [
      toolMsg({
        id: 'use-1',
        role: 'tool_use',
        toolUseId: 'call-1',
        toolName: 'list_agents',
        toolInput: { parentSessionId: 'p1' },
        content: '',
      }),
      toolMsg({
        id: 'result-1',
        role: 'tool_result',
        toolUseId: 'call-1',
        toolName: 'list_agents',
        toolResult: '[{"id":"a1"}]',
        content: '[{"id":"a1"}]',
        isDelta: false,
      }),
    ]

    renderWithProviders(<ToolOperationGroup messages={finished} isActive={false} />)

    const groupToggle = screen.getByTestId('tool-operation-group-toggle')
    fireEvent.click(groupToggle)
    expect(groupToggle).toHaveAttribute('aria-expanded', 'true')

    const cardToggle = screen.getByTestId('tool-use-card-toggle')
    expect(cardToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('输入参数')).not.toBeInTheDocument()
    expect(screen.queryByText('最终结果')).not.toBeInTheDocument()

    fireEvent.click(cardToggle)
    expect(cardToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('输入参数')).toBeInTheDocument()
    expect(screen.getByText('最终结果')).toBeInTheDocument()
  })

  it('lets the user expand a live group and collapse it again; expand sticks across in-flight updates', () => {
    const { rerender } = renderWithProviders(<ToolOperationGroup messages={liveTools} isActive />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/最近：/)).toBeInTheDocument()
    expect(screen.queryByText('Bash')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.queryByText(/最近：/)).not.toBeInTheDocument()

    // Streaming update (more output / still in flight) must not force-collapse.
    const updatedLive: ConversationMessage[] = [
      ...liveTools.slice(0, 2),
      toolMsg({
        id: 'result-1b',
        role: 'tool_result',
        toolUseId: 'call-1',
        toolName: 'Bash',
        toolResult: 'App.tsx\nmain.tsx\n',
        content: 'App.tsx\nmain.tsx\n',
        isDelta: true,
      }),
      liveTools[2],
    ]
    rerender(<ToolOperationGroup messages={updatedLive} isActive />)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bash')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/最近：/)).toBeInTheDocument()
    expect(screen.queryByText('Bash')).not.toBeInTheDocument()
  })

  it('does not dump raw JSON tool payloads into the collapsed summary', () => {
    const jsonTools: ConversationMessage[] = [
      toolMsg({
        id: 'use-json',
        role: 'tool_use',
        toolUseId: 'call-json',
        toolName: 'mempalace_search',
        toolInput: {
          query: 'stream live refresh',
          wing: 'allbeingsfuture',
          room: 'chat-live-refresh',
        },
        content: '',
      }),
    ]

    renderWithProviders(<ToolOperationGroup messages={jsonTools} isActive={false} />)

    const summary = screen.getByText(/最近：/)
    expect(summary.textContent).toMatch(/stream live refresh/)
    expect(summary.textContent).not.toMatch(/"wing"\s*:/)
    expect(summary.textContent).not.toMatch(/\{.*"query"/)
  })
})
