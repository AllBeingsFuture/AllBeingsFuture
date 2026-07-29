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

  it('renders coming soon for removed git panel', () => {
    uiState.activePanelLeft = 'git'
    renderWithProviders(<Sidebar />)
    expect(screen.getByText('即将推出')).toBeInTheDocument()
  })

  it('renders coming soon for unknown panels', () => {
    uiState.activePanelLeft = 'team'
    renderWithProviders(<Sidebar />)
    expect(screen.getByText('即将推出')).toBeInTheDocument()
  })
})
