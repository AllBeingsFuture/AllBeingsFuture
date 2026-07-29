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
  }),
]

describe('ToolOperationGroup', () => {
  it('auto-expands while active so each tool streams into the list', () => {
    renderWithProviders(<ToolOperationGroup messages={liveTools} isActive />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByText('Grep')).toBeInTheDocument()
    expect(screen.queryByText(/最近：/)).not.toBeInTheDocument()
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
    expect(screen.getByText(/最近：/)).toBeInTheDocument()
    expect(screen.queryByText('Grep')).not.toBeInTheDocument()
  })

  it('lets the user collapse a live group and re-expand it', () => {
    renderWithProviders(<ToolOperationGroup messages={liveTools} isActive />)

    const toggle = screen.getByTestId('tool-operation-group-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText(/最近：/)).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Collapsed header falls back to the latest one-line summary.
    expect(screen.getByText(/最近：/)).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText(/最近：/)).not.toBeInTheDocument()
  })
})
