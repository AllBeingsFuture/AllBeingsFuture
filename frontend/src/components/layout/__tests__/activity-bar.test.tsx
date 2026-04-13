import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import ActivityBar from '../ActivityBar'
import { renderWithProviders, screen } from '../../../test/render'
import { workbenchApi } from '../../../app/api/workbench'

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

vi.mock('../../../app/api/workbench', () => ({
  workbenchApi: {
    panel: {
      setSide: vi.fn(),
      show: vi.fn(),
      toggleShell: vi.fn(),
    },
    ui: {
      setTeamsMode: vi.fn(),
      setSettingsVisible: vi.fn(),
    },
  },
}))

describe('ActivityBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    panelState.activePanelLeft = 'sessions'
    uiState.teamsMode = false
  })

  it('switches panel when buttons are clicked', () => {
    renderWithProviders(<ActivityBar />)

    fireEvent.click(screen.getByRole('button', { name: '文件资源管理器' }))
    expect(workbenchApi.panel.show).toHaveBeenCalledWith('explorer', 'left')

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(workbenchApi.ui.setSettingsVisible).toHaveBeenCalledWith(true)
  })

  it('routes shell toggle through workbench api', () => {
    renderWithProviders(<ActivityBar />)

    fireEvent.click(screen.getByRole('button', { name: '终端 (Ctrl+`)' }))
    expect(workbenchApi.panel.toggleShell).toHaveBeenCalled()
  })

  it('renders panel buttons', () => {
    renderWithProviders(<ActivityBar />)

    expect(screen.getByRole('button', { name: '会话管理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '内置工具' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文件资源管理器' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Git 分支' })).toBeInTheDocument()
  })
})
