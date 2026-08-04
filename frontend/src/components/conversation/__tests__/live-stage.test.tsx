import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../../test/render'
import type { LiveBuffer } from '../../../types/sessionStreamTypes'
import LiveStage from '../LiveStage'

vi.mock('../ToolUseCard', () => ({
  default: ({ operation }: { operation?: { id: string; toolUse?: { toolName?: string } } }) => (
    <div data-testid="tool-use-card">{operation?.toolUse?.toolName || operation?.id}</div>
  ),
}))

vi.mock('../AgentActivityPanel', () => ({
  default: ({ stream }: { stream?: { phase?: string } }) => (
    stream?.permission
      ? <div data-testid="agent-activity-panel">permission</div>
      : null
  ),
}))

describe('LiveStage', () => {
  it('returns null when live is empty and stream is idle', () => {
    const { container } = renderWithProviders(
      <LiveStage
        live={null}
        stream={{ phase: 'idle', lastSequence: -1 }}
        sessionId="s1"
        onPermissionResponse={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-testid="live-stage"]')).toBeNull()
  })

  it('returns null for empty live buffer with no active stream UI', () => {
    const live: LiveBuffer = { tools: [] }
    const { container } = renderWithProviders(
      <LiveStage
        live={live}
        stream={{ phase: 'done', lastSequence: 1 }}
        sessionId="s1"
        onPermissionResponse={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-testid="live-stage"]')).toBeNull()
  })

  it('renders live tools above the composer surface', () => {
    const live: LiveBuffer = {
      tools: [
        {
          toolCallId: 'tc-1',
          name: 'Bash',
          title: 'Run tests',
          status: 'in_progress',
          input: { command: 'npm test' },
        },
      ],
    }

    renderWithProviders(
      <LiveStage
        live={live}
        sessionId="s1"
        onPermissionResponse={vi.fn()}
      />,
    )

    expect(screen.getByTestId('live-stage')).toBeInTheDocument()
    expect(screen.getByTestId('live-stage-tools')).toBeInTheDocument()
    expect(screen.getByTestId('tool-use-card')).toHaveTextContent('Bash')
  })

  it('renders thinking and assistant text when present', () => {
    const live: LiveBuffer = {
      thinking: { itemId: 'th-1', text: 'planning next step' },
      assistantText: { itemId: 'as-1', text: 'Here is the answer' },
      tools: [],
    }

    renderWithProviders(
      <LiveStage
        live={live}
        sessionId="s1"
        onPermissionResponse={vi.fn()}
      />,
    )

    expect(screen.getByTestId('live-stage-thinking')).toHaveTextContent('思考中')
    expect(screen.getByTestId('live-stage-thinking')).toHaveTextContent('planning next step')
    expect(screen.getByTestId('live-stage-assistant-text')).toHaveTextContent('Here is the answer')
  })

  it('shows activity panel when stream has a permission request', () => {
    renderWithProviders(
      <LiveStage
        live={null}
        stream={{
          phase: 'waiting_permission',
          lastSequence: 2,
          permission: {
            requestId: 'p1',
            title: 'Allow?',
            options: [{ optionId: 'yes', label: 'Yes', kind: 'allow_once' }],
          },
        }}
        sessionId="s1"
        onPermissionResponse={vi.fn()}
      />,
    )

    expect(screen.getByTestId('live-stage')).toBeInTheDocument()
    expect(screen.getByTestId('agent-activity-panel')).toBeInTheDocument()
  })
})
