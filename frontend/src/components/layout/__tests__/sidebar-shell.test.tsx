import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../../test/render'
import Sidebar from '../Sidebar'

const uiState = {
  activePanelLeft: 'sessions' as string,
}

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

vi.mock('../../sidebar/DashboardSidebarView', () => ({
  default: () => <div data-testid="dashboard-view" />,
}))
vi.mock('../../sidebar/TutorialSidebarView', () => ({
  default: () => <div data-testid="tutorial-view" />,
}))
vi.mock('../../files/FileManagerPanel', () => ({
  default: () => <div data-testid="file-manager-panel" />,
}))
vi.mock('../../git/WorktreePanel', () => ({
  default: () => <div data-testid="worktree-panel" />,
}))
vi.mock('../../tools/ToolsCatalogPanel', () => ({
  default: () => <div data-testid="tools-panel" />,
}))
vi.mock('../../panels/TimelinePanel', () => ({
  default: () => <div data-testid="timeline-panel" />,
}))
vi.mock('../../panels/StatsPanel', () => ({
  default: () => <div data-testid="stats-panel" />,
}))
vi.mock('../SessionsContent', () => ({
  default: () => <div data-testid="sessions-content" />,
}))

describe('Sidebar shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uiState.activePanelLeft = 'sessions'
  })

  it('renders the correct panel for each activePanelLeft value', () => {
    const { unmount } = renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('sessions-content')).toBeInTheDocument()
    unmount()

    uiState.activePanelLeft = 'dashboard'
    const { unmount: u2 } = renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    u2()

    uiState.activePanelLeft = 'tools'
    const { unmount: u3 } = renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('tools-panel')).toBeInTheDocument()
    u3()
  })

  it('shows coming-soon placeholder for unimplemented panels', () => {
    uiState.activePanelLeft = 'skills'
    renderWithProviders(<Sidebar />)
    expect(screen.getByText('即将推出')).toBeInTheDocument()
  })
})
