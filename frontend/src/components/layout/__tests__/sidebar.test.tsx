import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../../test/render'
import Sidebar from '../Sidebar'

const uiState = {
  activePanelLeft: 'sessions' as string,
}

vi.mock('../../../stores/panelStore', () => ({
  usePanelStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

vi.mock('../../files/FileManagerPanel', () => ({
  default: () => <div data-testid="file-manager-panel" />,
}))
vi.mock('../../git/WorktreePanel', () => ({
  default: () => <div data-testid="worktree-panel" />,
}))
vi.mock('../SessionsContent', () => ({
  default: () => <div data-testid="sessions-content" />,
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uiState.activePanelLeft = 'sessions'
  })

  it('renders sessions content when activePanelLeft is sessions', () => {
    renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('sessions-content')).toBeInTheDocument()
  })

  it('renders file manager when activePanelLeft is explorer', () => {
    uiState.activePanelLeft = 'explorer'
    renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('file-manager-panel')).toBeInTheDocument()
  })

  it('renders worktree panel when activePanelLeft is git', () => {
    uiState.activePanelLeft = 'git'
    renderWithProviders(<Sidebar />)
    expect(screen.getByTestId('worktree-panel')).toBeInTheDocument()
  })

  it('renders coming soon for unknown panels', () => {
    uiState.activePanelLeft = 'mcp'
    renderWithProviders(<Sidebar />)
    expect(screen.getByText('即将推出')).toBeInTheDocument()
  })
})
