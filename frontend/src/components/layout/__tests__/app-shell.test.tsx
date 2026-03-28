import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { renderWithProviders, screen } from '../../../test/render'

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

vi.mock('../Sidebar', () => ({ default: stubComponent('sidebar') }))
vi.mock('../MainPanel', () => ({ default: stubComponent('main-panel') }))
vi.mock('../RightPanel', () => ({ default: stubComponent('right-panel') }))
vi.mock('../StatusBar', () => ({ default: stubComponent('status-bar') }))
vi.mock('../ActivityBar', () => ({ default: stubComponent('activity-bar') }))
vi.mock('../TitleBar', () => ({ default: stubComponent('title-bar') }))
vi.mock('../SearchPanel', () => ({ default: stubComponent('search-panel') }))
vi.mock('../HistoryPanel', () => ({ default: stubComponent('history-panel') }))
vi.mock('../../settings/SettingsModal', () => ({ default: stubComponent('settings-modal') }))
vi.mock('../../sessions/SessionCreator', () => ({ default: stubComponent('session-creator') }))
vi.mock('../../file-manager/QuickOpenDialog', () => ({ default: stubComponent('quick-open') }))

describe('App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders core layout components', () => {
    renderWithProviders(<App />)

    expect(screen.getByTestId('activity-bar')).toBeInTheDocument()
    expect(screen.getByTestId('title-bar')).toBeInTheDocument()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('reserves a right gutter for the detail toggle so it does not cover the main panel scrollbar', () => {
    renderWithProviders(<App />)

    expect(screen.getByTestId('main-panel').parentElement).toHaveClass('pr-6')
  })
})
