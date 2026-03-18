import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPanel from '../SessionPanel'
import { renderWithProviders, screen } from '../../../test/render'

const sessionState = {
  sessions: [
    {
      id: 'session-1',
      name: 'Main Session',
      providerId: 'codex',
      workingDirectory: 'C:/repo/project',
      status: 'idle',
      mode: 'normal',
      startedAt: new Date().toISOString(),
    },
    {
      id: 'session-2',
      name: 'Review Session',
      providerId: 'claude-code',
      workingDirectory: 'C:/repo/project',
      status: 'running',
      mode: 'supervisor',
      startedAt: new Date().toISOString(),
    },
  ],
  selectedId: 'session-1',
  loading: false,
  messages: [
    { role: 'user', content: 'hello', partial: false },
    { role: 'assistant', content: 'world', partial: false },
  ],
  streaming: false,
  chatError: '',
  select: vi.fn(),
  remove: vi.fn(),
  end: vi.fn(),
  initProcess: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  pollChat: vi.fn().mockResolvedValue(undefined),
  handleChatUpdate: vi.fn(),
  stopProcess: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) =>
    typeof selector === 'function' ? selector(sessionState) : sessionState,
}))

vi.mock('../../../hooks/useIpcEvent', () => ({
  useIpcEvent: vi.fn(),
}))

describe('Session workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders conversation view for selected session', async () => {
    renderWithProviders(<SessionPanel />)

    expect(screen.getByTestId('session-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('conversation-view')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(await screen.findByPlaceholderText(/输入消息/i)).toBeInTheDocument()
  })
})
