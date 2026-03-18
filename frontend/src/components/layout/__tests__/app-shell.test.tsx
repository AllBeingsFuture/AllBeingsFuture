import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { act, renderWithProviders, screen, waitFor } from '../../../test/render'

const teamState = {
  loadDefinitions: vi.fn(),
  loadInstances: vi.fn(),
}
const sessionState = {
  load: vi.fn(),
  sessions: [],
  selectedId: null,
}
const settingsState = {
  load: vi.fn(),
  settings: {},
  loaded: false,
}
const taskState = {
  load: vi.fn(),
  tasks: [],
}
const workflowState = {
  load: vi.fn(),
}
const missionState = {
  load: vi.fn(),
}

vi.mock('../../../stores/teamStore', () => ({
  useTeamStore: (selector: (state: typeof teamState) => unknown) => selector(teamState),
}))

vi.mock('../../../stores/sessionStore', () => ({
  useSessionStore: (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
}))

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}))

vi.mock('../../../stores/taskStore', () => ({
  useTaskStore: (selector: (state: typeof taskState) => unknown) => selector(taskState),
}))

vi.mock('../../../stores/workflowStore', () => ({
  useWorkflowStore: (selector: (state: typeof workflowState) => unknown) => selector(workflowState),
}))

vi.mock('../../../stores/missionStore', () => ({
  useMissionStore: (selector: (state: typeof missionState) => unknown) => selector(missionState),
}))

function stubComponent(testId: string) {
  return function StubComponent(): ReactNode {
    return <div data-testid={testId} />
  }
}

vi.mock('../Sidebar', () => ({ default: stubComponent('legacy-sidebar') }))
vi.mock('../../dashboard/DashboardView', () => ({ default: stubComponent('dashboard-view') }))
vi.mock('../../sessions/SessionPanel', () => ({ default: stubComponent('session-panel') }))
vi.mock('../../teams/TeamPanel', () => ({ default: stubComponent('team-panel') }))
vi.mock('../../kanban/KanbanBoard', () => ({ default: stubComponent('kanban-board') }))
vi.mock('../../workflow/WorkflowPanel', () => ({ default: stubComponent('workflow-panel') }))
vi.mock('../../mission/MissionPanel', () => ({ default: stubComponent('mission-panel') }))
vi.mock('../../files/FileManagerPanel', () => ({ default: stubComponent('file-manager-panel') }))
vi.mock('../../git/WorktreePanel', () => ({ default: stubComponent('worktree-panel') }))
vi.mock('../../settings/SettingsModal', () => ({ default: stubComponent('settings-modal') }))

describe('App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders claudeops shell chrome', () => {
    renderWithProviders(<App />)

    expect(screen.getByTestId('activity-bar')).toBeInTheDocument()
    expect(screen.getByTestId('title-bar')).toBeInTheDocument()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('opens settings when claudeops event bus requests a tab', async () => {
    renderWithProviders(<App />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: 'account' }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument()
    })
  })
})
