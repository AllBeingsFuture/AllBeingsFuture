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

export const STORAGE_KEYS = {
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

export const WORKSPACE_PANEL_MAP = {
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

export type WorkspacePanelId = keyof typeof WORKSPACE_PANEL_MAP

export const ALL_PANEL_IDS: PanelId[] = [
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

export const DEFAULT_PANEL_SIDES: Record<PanelId, PanelSide> = {
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

export function readStorage<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
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

export function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && ['sessions', 'dashboard', 'files', 'worktree', 'kanban', 'workflows', 'missions', 'teams'].includes(value)
}

export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && ['grid', 'tabs'].includes(value)
}

export function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === 'string' && ['single', 'split-h', 'split-v'].includes(value)
}

export function isPaneContent(value: unknown): value is PaneContent {
  return isWorkspaceView(value)
}

export function isBooleanString(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isPanelSideRecord(value: unknown): value is Record<PanelId, PanelSide> {
  if (!value || typeof value !== 'object') return false

  return ALL_PANEL_IDS.every((panelId) => {
    const side = (value as Record<string, unknown>)[panelId]
    return side === 'left' || side === 'right'
  })
}

export function readPanelSides(): Record<PanelId, PanelSide> {
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

export function persistPanelSides(panelSides: Record<PanelId, PanelSide>) {
  writeStorage(STORAGE_KEYS.panelSides, JSON.stringify(panelSides))
}

export function firstPanelForSide(panelSides: Record<PanelId, PanelSide>, side: PanelSide, fallback: PanelId): PanelId {
  return ALL_PANEL_IDS.find((panelId) => panelSides[panelId] === side) ?? fallback
}

export function isWorkspacePanel(panelId: PanelId): panelId is WorkspacePanelId {
  return panelId in WORKSPACE_PANEL_MAP
}

export function persistWorkspace(view: WorkspaceView, primaryPane: PaneContent) {
  writeStorage(STORAGE_KEYS.activeView, view)
  writeStorage(STORAGE_KEYS.primaryPane, primaryPane)
}
