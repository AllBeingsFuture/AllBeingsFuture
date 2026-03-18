import { create } from 'zustand'

export type WorkspaceView =
  | 'sessions'
  | 'dashboard'
  | 'files'
  | 'worktree'
  | 'kanban'
  | 'workflows'
  | 'missions'
  | 'teams'

export type ViewMode = 'grid' | 'tabs'
export type LayoutMode = 'single' | 'split-h' | 'split-v'
export type PaneContent = WorkspaceView
export type PanelSide = 'left' | 'right'
export type ExplorerView = 'tree' | 'search'

export type PanelId =
  | 'sessions'
  | 'explorer'
  | 'git'
  | 'dashboard'
  | 'files'
  | 'worktree'
  | 'kanban'
  | 'workflows'
  | 'missions'
  | 'mcp'
  | 'skills'
  | 'tools'
  | 'team'
  | 'tutorial'
  | 'timeline'
  | 'stats'

const STORAGE_KEYS = {
  activeView: 'allbeingsfuture-active-view',
  viewMode: 'allbeingsfuture-view-mode',
  layoutMode: 'allbeingsfuture-layout-mode',
  primaryPane: 'allbeingsfuture-pane-primary',
  secondaryPane: 'allbeingsfuture-pane-secondary',
  sidebarCollapsed: 'allbeingsfuture-sidebar-collapsed',
  detailPanelCollapsed: 'allbeingsfuture-detail-collapsed',
  shellPanelVisible: 'allbeingsfuture-shell-visible',
  panelSides: 'allbeingsfuture-panel-sides',
} as const

const WORKSPACE_PANEL_MAP = {
  sessions: 'sessions',
  explorer: 'files',
  git: 'worktree',
  dashboard: 'dashboard',
  files: 'files',
  worktree: 'worktree',
  kanban: 'kanban',
  workflows: 'workflows',
  missions: 'missions',
} as const satisfies Record<string, WorkspaceView>

type WorkspacePanelId = keyof typeof WORKSPACE_PANEL_MAP

const ALL_PANEL_IDS: PanelId[] = [
  'sessions',
  'explorer',
  'git',
  'dashboard',
  'files',
  'worktree',
  'kanban',
  'workflows',
  'missions',
  'mcp',
  'skills',
  'tools',
  'team',
  'tutorial',
  'timeline',
  'stats',
]

const DEFAULT_PANEL_SIDES: Record<PanelId, PanelSide> = {
  sessions: 'left',
  explorer: 'left',
  git: 'left',
  dashboard: 'left',
  files: 'left',
  worktree: 'left',
  kanban: 'left',
  workflows: 'left',
  missions: 'left',
  mcp: 'left',
  skills: 'left',
  tools: 'left',
  team: 'left',
  tutorial: 'left',
  timeline: 'right',
  stats: 'right',
}

function readStorage<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed: unknown = raw === 'true' ? true : raw === 'false' ? false : raw
    if (!validate || validate(parsed)) {
      return parsed as T
    }
  } catch {
    // Ignore storage failures and fall back to defaults.
  }

  return fallback
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && ['sessions', 'dashboard', 'files', 'worktree', 'kanban', 'workflows', 'missions', 'teams'].includes(value)
}

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && ['grid', 'tabs'].includes(value)
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === 'string' && ['single', 'split-h', 'split-v'].includes(value)
}

function isPaneContent(value: unknown): value is PaneContent {
  return isWorkspaceView(value)
}

function isBooleanString(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isPanelSideRecord(value: unknown): value is Record<PanelId, PanelSide> {
  if (!value || typeof value !== 'object') return false

  return ALL_PANEL_IDS.every((panelId) => {
    const side = (value as Record<string, unknown>)[panelId]
    return side === 'left' || side === 'right'
  })
}

function readPanelSides(): Record<PanelId, PanelSide> {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PANEL_SIDES }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.panelSides)
    if (!raw) return { ...DEFAULT_PANEL_SIDES }
    const parsed = JSON.parse(raw) as unknown
    if (isPanelSideRecord(parsed)) {
      return parsed
    }
  } catch {
    // Ignore invalid storage.
  }

  return { ...DEFAULT_PANEL_SIDES }
}

function persistPanelSides(panelSides: Record<PanelId, PanelSide>) {
  writeStorage(STORAGE_KEYS.panelSides, JSON.stringify(panelSides))
}

function firstPanelForSide(panelSides: Record<PanelId, PanelSide>, side: PanelSide, fallback: PanelId): PanelId {
  return ALL_PANEL_IDS.find((panelId) => panelSides[panelId] === side) ?? fallback
}

function isWorkspacePanel(panelId: PanelId): panelId is WorkspacePanelId {
  return panelId in WORKSPACE_PANEL_MAP
}

export interface UIStateSnapshot {
  activeView: WorkspaceView
  viewMode: ViewMode
  layoutMode: LayoutMode
  primaryPane: PaneContent
  secondaryPane: PaneContent
  panelSides: Record<PanelId, PanelSide>
  activePanelLeft: PanelId
  activePanelRight: PanelId
  sidebarCollapsed: boolean
  detailPanelCollapsed: boolean
  shellPanelVisible: boolean
  showSettings: boolean
  showSearchPanel: boolean
  showHistoryPanel: boolean
  showQuickOpen: boolean
  explorerView: ExplorerView
  showLogViewer: boolean
  showNewTaskDialog: boolean
  showNewSessionDialog: boolean
  teamsMode: boolean
  floatingPanels: Record<string, boolean>
  sidebarWidth: number
  detailPanelWidth: number
  selectedTaskId: string | null
}

export function createDefaultUIState(): UIStateSnapshot {
  const panelSides = readPanelSides()
  const primaryPane = readStorage<PaneContent>(STORAGE_KEYS.primaryPane, 'sessions', isPaneContent)
  const activeView = readStorage<WorkspaceView>(STORAGE_KEYS.activeView, primaryPane, isWorkspaceView)

  return {
    activeView,
    viewMode: readStorage<ViewMode>(STORAGE_KEYS.viewMode, 'grid', isViewMode),
    layoutMode: readStorage<LayoutMode>(STORAGE_KEYS.layoutMode, 'single', isLayoutMode),
    primaryPane,
    secondaryPane: readStorage<PaneContent>(STORAGE_KEYS.secondaryPane, 'files', isPaneContent),
    panelSides,
    activePanelLeft: firstPanelForSide(panelSides, 'left', 'sessions'),
    activePanelRight: firstPanelForSide(panelSides, 'right', 'timeline'),
    sidebarCollapsed: readStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false, isBooleanString),
    detailPanelCollapsed: readStorage<boolean>(STORAGE_KEYS.detailPanelCollapsed, false, isBooleanString),
    shellPanelVisible: readStorage<boolean>(STORAGE_KEYS.shellPanelVisible, false, isBooleanString),
    showSettings: false,
    showSearchPanel: false,
    showHistoryPanel: false,
    showQuickOpen: false,
    explorerView: 'tree',
    showLogViewer: false,
    showNewTaskDialog: false,
    showNewSessionDialog: false,
    teamsMode: activeView === 'teams',
    floatingPanels: {},
    sidebarWidth: 280,
    detailPanelWidth: 320,
    selectedTaskId: null,
  }
}

interface UIState extends UIStateSnapshot {
  setActiveView: (view: WorkspaceView) => void
  setViewMode: (mode: ViewMode) => void
  setLayoutMode: (mode: LayoutMode) => void
  setPaneContent: (pane: 'primary' | 'secondary', content: PaneContent) => void
  swapPanes: () => void
  setPanelSide: (panelId: PanelId, side: PanelSide) => void
  setActivePanelLeft: (panelId: PanelId) => void
  setActivePanelRight: (panelId: PanelId) => void
  toggleSidebar: () => void
  toggleDetailPanel: () => void
  toggleShellPanel: () => void
  setTeamsMode: (enabled: boolean) => void
  setShowSettings: (show: boolean) => void
  toggleSearchPanel: () => void
  toggleHistoryPanel: () => void
  toggleQuickOpen: () => void
  setExplorerView: (view: ExplorerView) => void
  toggleLogViewer: () => void
  setSidebarWidth: (width: number) => void
  setDetailPanelWidth: (width: number) => void
  setSelectedTaskId: (id: string | null) => void
  toggleNewTaskDialog: () => void
  setShowNewSessionDialog: (show: boolean) => void
  toggleFloatingPanel: (id: string) => void
  closeFloatingPanel: (id: string) => void
}

function persistWorkspace(view: WorkspaceView, primaryPane: PaneContent) {
  writeStorage(STORAGE_KEYS.activeView, view)
  writeStorage(STORAGE_KEYS.primaryPane, primaryPane)
}

export const useUIStore = create<UIState>((set, get) => ({
  ...createDefaultUIState(),

  setActiveView: (view) => {
    persistWorkspace(view, view)
    set({
      activeView: view,
      primaryPane: view,
      teamsMode: view === 'teams',
    })
  },

  setViewMode: (mode) => {
    writeStorage(STORAGE_KEYS.viewMode, mode)
    set({ viewMode: mode })
  },

  setLayoutMode: (mode) => {
    writeStorage(STORAGE_KEYS.layoutMode, mode)
    set({ layoutMode: mode })
  },

  setPaneContent: (pane, content) => {
    if (pane === 'primary') {
      persistWorkspace(content, content)
      set({
        primaryPane: content,
        activeView: content,
        teamsMode: content === 'teams',
      })
      return
    }

    writeStorage(STORAGE_KEYS.secondaryPane, content)
    set({ secondaryPane: content })
  },

  swapPanes: () => {
    const { primaryPane, secondaryPane } = get()
    persistWorkspace(secondaryPane, secondaryPane)
    writeStorage(STORAGE_KEYS.secondaryPane, primaryPane)
    set({
      primaryPane: secondaryPane,
      secondaryPane: primaryPane,
      activeView: secondaryPane,
      teamsMode: secondaryPane === 'teams',
    })
  },

  setPanelSide: (panelId, side) => {
    set((state) => {
      if (state.panelSides[panelId] === side) {
        return state
      }

      const panelSides = { ...state.panelSides, [panelId]: side }
      persistPanelSides(panelSides)

      let activePanelLeft = state.activePanelLeft
      let activePanelRight = state.activePanelRight
      const nextState: Partial<UIStateSnapshot> = { panelSides }

      if (side === 'left') {
        activePanelLeft = panelId
        if (state.activePanelRight === panelId) {
          activePanelRight = firstPanelForSide(panelSides, 'right', 'timeline')
        }
        nextState.sidebarCollapsed = false
      } else {
        activePanelRight = panelId
        if (state.activePanelLeft === panelId) {
          activePanelLeft = firstPanelForSide(panelSides, 'left', 'sessions')
        }
        nextState.detailPanelCollapsed = false
      }

      nextState.activePanelLeft = activePanelLeft
      nextState.activePanelRight = activePanelRight

      if (side === 'left' && isWorkspacePanel(panelId)) {
        persistWorkspace(WORKSPACE_PANEL_MAP[panelId], WORKSPACE_PANEL_MAP[panelId])
        nextState.activeView = WORKSPACE_PANEL_MAP[panelId]
        nextState.primaryPane = WORKSPACE_PANEL_MAP[panelId]
        nextState.teamsMode = false
      }

      return nextState as UIState
    })
  },

  setActivePanelLeft: (panelId) => {
    if (!isWorkspacePanel(panelId)) {
      set({ activePanelLeft: panelId, sidebarCollapsed: false })
      return
    }

    const view = WORKSPACE_PANEL_MAP[panelId]
    persistWorkspace(view, view)
    set({
      activePanelLeft: panelId,
      activeView: view,
      primaryPane: view,
      teamsMode: false,
      sidebarCollapsed: false,
    })
  },

  setActivePanelRight: (panelId) => {
    set({
      activePanelRight: panelId,
      detailPanelCollapsed: false,
    })
  },

  toggleSidebar: () => {
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed
      writeStorage(STORAGE_KEYS.sidebarCollapsed, String(sidebarCollapsed))
      return { sidebarCollapsed }
    })
  },

  toggleDetailPanel: () => {
    set((state) => {
      const detailPanelCollapsed = !state.detailPanelCollapsed
      writeStorage(STORAGE_KEYS.detailPanelCollapsed, String(detailPanelCollapsed))
      return { detailPanelCollapsed }
    })
  },

  toggleShellPanel: () => {
    set((state) => {
      const shellPanelVisible = !state.shellPanelVisible
      writeStorage(STORAGE_KEYS.shellPanelVisible, String(shellPanelVisible))
      return { shellPanelVisible }
    })
  },

  setTeamsMode: (enabled) => {
    set((state) => {
      if (enabled) {
        persistWorkspace('teams', 'teams')
        return {
          teamsMode: true,
          activeView: 'teams',
          primaryPane: 'teams',
        }
      }

      if (state.activeView === 'teams') {
        persistWorkspace('sessions', 'sessions')
        return {
          teamsMode: false,
          activeView: 'sessions',
          primaryPane: 'sessions',
          activePanelLeft: state.panelSides.sessions === 'left' ? 'sessions' : state.activePanelLeft,
        }
      }

      return { teamsMode: false }
    })
  },

  setShowSettings: (show) => set({ showSettings: show }),
  toggleSearchPanel: () => set((state) => ({ showSearchPanel: !state.showSearchPanel })),
  toggleHistoryPanel: () => set((state) => ({ showHistoryPanel: !state.showHistoryPanel })),
  toggleQuickOpen: () => set((state) => ({ showQuickOpen: !state.showQuickOpen })),
  setExplorerView: (view) => set({ explorerView: view }),
  toggleLogViewer: () => set((state) => ({ showLogViewer: !state.showLogViewer })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  toggleNewTaskDialog: () => set((state) => ({ showNewTaskDialog: !state.showNewTaskDialog })),
  setShowNewSessionDialog: (show) => set({ showNewSessionDialog: show }),
  toggleFloatingPanel: (id) => set((state) => ({
    floatingPanels: { ...state.floatingPanels, [id]: !state.floatingPanels[id] },
  })),
  closeFloatingPanel: (id) => set((state) => ({
    floatingPanels: { ...state.floatingPanels, [id]: false },
  })),
}))
