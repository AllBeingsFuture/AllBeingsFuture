import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen } from '../../../test/render'
import Sidebar from '../Sidebar'

const sessionState = {
  sessions: [
    {
      id: 'session-1',
      name: 'Alpha Fix',
      providerId: 'codex',
      workingDirectory: 'C:/repo/alpha',
      status: 'running',
      mode: 'normal',
      initialPrompt: '',
      autoAccept: false,
      worktreePath: '',
      worktreeBranch: '',
      worktreeBaseCommit: '',
      worktreeBaseBranch: '',
      worktreeMerged: false,
      worktreeSourceRepo: '',
      startedAt: '2026-03-11T09:00:00.000Z',
      endedAt: null,
    },
    {
      id: 'session-2',
      name: 'Docs Review',
      providerId: 'claude-code',
      workingDirectory: 'C:/repo/docs',
      status: 'waiting_input',
      mode: 'mission',
      initialPrompt: '',
      autoAccept: true,
      worktreePath: '',
      worktreeBranch: '',
      worktreeBaseCommit: '',
      worktreeBaseBranch: '',
      worktreeMerged: false,
      worktreeSourceRepo: '',
      startedAt: '2026-03-10T08:00:00.000Z',
      endedAt: null,
    },
  ],
  selectedId: 'session-1',
  loading: false,
  messages: [],
  streaming: false,
  chatError: '',
  load: vi.fn(),
  create: vi.fn(),
  select: vi.fn(),
  remove: vi.fn(),
  end: vi.fn(),
  initProcess: vi.fn(),
  sendMessage: vi.fn(),
  pollChat: vi.fn(),
  handleChatUpdate: vi.fn(),
  stopProcess: vi.fn(),
  markWorktreeMerged: vi.fn(),
}

const uiState = {
  activeView: 'sessions',
  sidebarCollapsed: false,
  detailPanelCollapsed: false,
  showSettings: false,
  showSearchPanel: false,
  showHistoryPanel: false,
  showNewSessionDialog: false,
  setActiveView: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleDetailPanel: vi.fn(),
  setShowSettings: vi.fn(),
  toggleSearchPanel: vi.fn(),
  toggleHistoryPanel: vi.fn(),
  setShowNewSessionDialog: vi.fn(),
}

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) =>
    typeof selector === 'function' ? selector(sessionState) : sessionState,
}))

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    window.allBeingsFuture = {
      provider: {
        getAll: vi.fn().mockResolvedValue([
          { id: 'codex', name: 'Codex' },
          { id: 'claude-code', name: 'Claude Code' },
        ]),
      },
      session: {
        getAll: vi.fn(),
        getHistory: vi.fn(),
        create: vi.fn(),
        terminate: vi.fn(),
        getConversation: vi.fn(),
        getQueue: vi.fn(),
        clearQueue: vi.fn(),
      },
      app: {
        quit: vi.fn(),
        selectDirectory: vi.fn().mockResolvedValue('C:/repo/new-task'),
        selectFile: vi.fn(),
        openInExplorer: vi.fn(),
        openInTerminal: vi.fn(),
      },
      clipboard: {
        writeText: vi.fn(),
        readText: vi.fn(),
      },
      update: {
        getState: vi.fn(),
        checkForUpdates: vi.fn(),
        openDownloadPage: vi.fn(),
      },
      log: {
        getRecent: vi.fn(),
        openFile: vi.fn(),
      },
      pty: {
        getShells: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        onData: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
      },
      shortcut: {
        configureFeatureShortcuts: vi.fn(),
        onViewMode: vi.fn(() => () => {}),
        onCycleTerminal: vi.fn(() => () => {}),
        onNewSession: vi.fn(() => () => {}),
        onNewTaskSession: vi.fn(() => () => {}),
        onToggleSidebar: vi.fn(() => () => {}),
        onToggleShellPanel: vi.fn(() => () => {}),
        onQuickOpen: vi.fn(() => () => {}),
        onReplaceInFiles: vi.fn(() => () => {}),
        dispose: vi.fn(),
      },
    }
  })

  it('renders sidebar actions and session metadata', () => {
    renderWithProviders(<Sidebar />)

    expect(screen.getByRole('button', { name: '新建会话' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建任务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()

    expect(screen.getByText('Alpha Fix')).toBeInTheDocument()
    expect(screen.getByText('Docs Review')).toBeInTheDocument()
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0)
    expect(screen.getByText('等待输入')).toBeInTheDocument()
    expect(screen.getByText('repo/alpha')).toBeInTheDocument()
    expect(screen.getByText('repo/docs')).toBeInTheDocument()
  })

  it('delegates search, new session and session selection to stores', () => {
    renderWithProviders(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    fireEvent.click(screen.getByRole('button', { name: 'Docs Review' }))

    expect(uiState.toggleSearchPanel).toHaveBeenCalledTimes(1)
    expect(uiState.setShowNewSessionDialog).toHaveBeenCalledWith(true)
    expect(sessionState.select).toHaveBeenCalledWith('session-2')
  })
})
