import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import ActivityBar from '../ActivityBar'
import { renderWithProviders, screen } from '../../../test/render'

const panelState = {
  panelSides: {
    sessions: 'left', explorer: 'left', git: 'left', dashboard: 'left',
    files: 'left', worktree: 'left', kanban: 'left', workflows: 'left',
    missions: 'left', mcp: 'left', skills: 'left', team: 'left',
    tutorial: 'left', timeline: 'right', stats: 'right', tools: 'left',
  },
  activePanelLeft: 'sessions',
  activePanelRight: 'timeline',
  setPanelSide: vi.fn(),
  setActivePanelLeft: vi.fn(),
  setActivePanelRight: vi.fn(),
  shellPanelVisible: false,
  toggleShellPanel: vi.fn(),
}

const uiState = {
  teamsMode: false,
  setTeamsMode: vi.fn(),
}

vi.mock('../../../stores/panelStore', () => ({
  usePanelStore: (selector?: (state: typeof panelState) => unknown) =>
    typeof selector === 'function' ? selector(panelState) : panelState,
}))

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    typeof selector === 'function' ? selector(uiState) : uiState,
}))

describe('ActivityBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    panelState.activePanelLeft = 'sessions'
    uiState.teamsMode = false
  })

  it('switches panel when buttons are clicked', () => {
    const onOpenSettings = vi.fn()
    renderWithProviders(<ActivityBar onOpenSettings={onOpenSettings} />)

    fireEvent.click(screen.getByRole('button', { name: '文件资源管理器' }))
    expect(panelState.setActivePanelLeft).toHaveBeenCalledWith('explorer')

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('renders panel buttons', () => {
    renderWithProviders(<ActivityBar onOpenSettings={vi.fn()} />)

    expect(screen.getByRole('button', { name: '会话管理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '内置工具' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文件资源管理器' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Git 分支' })).toBeInTheDocument()
  })
})
