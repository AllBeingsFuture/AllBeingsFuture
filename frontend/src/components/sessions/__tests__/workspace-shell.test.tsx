import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPanel from '../SessionPanel'
import SessionCreator from '../SessionCreator'
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../test/render'

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
  childToParent: {},
  agents: {},
  sentImages: [],
  create: vi.fn().mockResolvedValue({ id: 'session-new' }),
  select: vi.fn(),
  remove: vi.fn(),
  end: vi.fn(),
  initProcess: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  pollChat: vi.fn().mockResolvedValue(undefined),
  handleChatUpdate: vi.fn(),
  handleAgentUpdate: vi.fn(),
  stopProcess: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) =>
    typeof selector === 'function' ? selector(sessionState) : sessionState,
}))

vi.mock('../../../hooks/useIpcEvent', () => ({
  useIpcEvent: vi.fn(),
}))

vi.mock('../../../bindings/electron-api', () => ({
  AppAPI: {
    selectDirectory: vi.fn(),
  },
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

  it('creates sessions without eager worktree isolation', async () => {
    renderWithProviders(<SessionCreator onClose={vi.fn()} />)

    const inputs = screen.getAllByRole('textbox')
    const nameInput = inputs[0]
    const workDirInput = inputs[1]

    fireEvent.change(nameInput, { target: { value: 'Worktree Rule Session' } })
    fireEvent.change(workDirInput, { target: { value: 'C:/repo/project' } })

    const promptInput = screen.getByPlaceholderText('创建后自动发送的指令...')
    fireEvent.change(promptInput, { target: { value: '检查仓库并按规则执行' } })

    const createButton = screen.getByRole('button', { name: '创建' })
    fireEvent.click(createButton)

    await waitFor(() => {
      expect(sessionState.create).toHaveBeenCalledWith(expect.objectContaining({
        workingDirectory: 'C:/repo/project',
        worktreeEnabled: false,
        gitRepoPath: '',
        gitBranch: '',
      }))
    })
  })
})
