import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { renderWithProviders, screen } from '../../../test/render'

const sessionState = {
  sessions: [
    {
      id: 'session-1',
      name: 'Implement Shell Port',
      providerId: 'codex',
      workingDirectory: 'C:/repo/apps/desktop',
      status: 'running',
      mode: 'normal',
      startedAt: '2026-03-11T16:10:00.000Z',
      worktreeBranch: 'worktree/ui-shell',
    },
    {
      id: 'session-2',
      name: 'Review Teams Surface',
      providerId: 'claude-code',
      workingDirectory: 'C:/repo/apps/desktop',
      status: 'idle',
      mode: 'supervisor',
      startedAt: '2026-03-11T14:05:00.000Z',
      worktreeBranch: '',
    },
    {
      id: 'session-3',
      name: 'Fix Mission Planner',
      providerId: 'codex',
      workingDirectory: 'C:/repo/libs/planner',
      status: 'completed',
      mode: 'mission',
      startedAt: '2026-03-09T09:00:00.000Z',
      endedAt: '2026-03-09T10:00:00.000Z',
      worktreeBranch: '',
    },
  ],
  selectedId: 'session-2',
  select: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}

const teamState = {
  instances: [
    {
      id: 'team-1',
      name: 'UI Port Team',
      status: 'running',
      members: [{ id: 'member-1' }, { id: 'member-2' }],
    },
  ],
  loadInstances: vi.fn().mockResolvedValue(undefined),
}

const uiState = {
  activeView: 'sessions',
  setActiveView: vi.fn(),
  toggleSearchPanel: vi.fn(),
  setShowSettings: vi.fn(),
  setShowNewSessionDialog: vi.fn(),
}

const taskState = {
  create: vi.fn().mockResolvedValue({ id: 'task-1' }),
}

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) =>
    typeof selector === 'function' ? selector(sessionState) : sessionState,
}))

vi.mock('../../../stores/teamStore', () => ({
  useTeamStore: (selector?: (state: typeof teamState) => unknown) =>
    typeof selector === 'function' ? selector(teamState) : teamState,
}))

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

vi.mock('../../../stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskState) => unknown) =>
    typeof selector === 'function' ? selector(taskState) : taskState,
}))

vi.mock('../sidebar/NewTaskDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="new-task-dialog">
      New Task Dialog
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}))

describe('Sidebar shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uiState.activeView = 'sessions'
  })

  it('renders compact sidebar with actions and grouped sessions', () => {
    renderWithProviders(<Sidebar />)

    expect(screen.getByText('会话')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建会话' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建任务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0)
    expect(screen.getByText('Implement Shell Port')).toBeInTheDocument()
    expect(screen.getAllByText('apps/desktop').length).toBeGreaterThan(0)
  })

  it('opens quick entry modals and forwards session actions', () => {
    renderWithProviders(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(uiState.setShowNewSessionDialog).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: '新建任务' }))
    expect(screen.getByTestId('new-task-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(uiState.toggleSearchPanel).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Implement Shell Port' }))
    expect(sessionState.select).toHaveBeenCalledWith('session-1')
    expect(uiState.setActiveView).toHaveBeenCalledWith('sessions')
  })

  it('switches to directory grouping', () => {
    renderWithProviders(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: '按目录' }))

    expect(screen.getAllByText('apps/desktop').length).toBeGreaterThan(0)
    expect(screen.getAllByText('libs/planner').length).toBeGreaterThan(0)
  })
})
