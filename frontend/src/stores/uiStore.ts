import { create } from 'zustand'

import type { ExplorerView, PaneContent, ViewMode, WorkspaceView } from './ui-helpers'
import {
  STORAGE_KEYS,
  isViewMode,
  isWorkspaceView,
  isPaneContent,
  persistWorkspace,
  readStorage,
  writeStorage,
} from './ui-helpers'
import { useLayoutStore } from './layoutStore'
import { usePanelStore } from './panelStore'

// Re-export all types from ui-helpers so existing consumers can still import from uiStore
export type {
  WorkspaceView,
  ViewMode,
  LayoutMode,
  PaneContent,
  PanelSide,
  ExplorerView,
  PanelId,
} from './ui-helpers'

export interface UIStateSnapshot {
  activeView: WorkspaceView
  viewMode: ViewMode
  teamsMode: boolean
  showSettings: boolean
  showSearchPanel: boolean
  showHistoryPanel: boolean
  showQuickOpen: boolean
  explorerView: ExplorerView
  showLogViewer: boolean
  showNewTaskDialog: boolean
  showNewSessionDialog: boolean
  selectedTaskId: string | null
}

interface UIState extends UIStateSnapshot {
  setActiveView: (view: WorkspaceView) => void
  setViewMode: (mode: ViewMode) => void
  setTeamsMode: (enabled: boolean) => void
  setShowSettings: (show: boolean) => void
  toggleSearchPanel: () => void
  toggleHistoryPanel: () => void
  toggleQuickOpen: () => void
  setExplorerView: (view: ExplorerView) => void
  toggleLogViewer: () => void
  setSelectedTaskId: (id: string | null) => void
  toggleNewTaskDialog: () => void
  setShowNewSessionDialog: (show: boolean) => void
}

export function createDefaultUIState(): UIStateSnapshot {
  const primaryPane = readStorage<PaneContent>(STORAGE_KEYS.primaryPane, 'sessions', isPaneContent)
  const activeView = readStorage<WorkspaceView>(STORAGE_KEYS.activeView, primaryPane, isWorkspaceView)

  return {
    activeView,
    viewMode: readStorage<ViewMode>(STORAGE_KEYS.viewMode, 'grid', isViewMode),
    teamsMode: activeView === 'teams',
    showSettings: false,
    showSearchPanel: false,
    showHistoryPanel: false,
    showQuickOpen: false,
    explorerView: 'tree',
    showLogViewer: false,
    showNewTaskDialog: false,
    showNewSessionDialog: false,
    selectedTaskId: null,
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  ...createDefaultUIState(),

  setActiveView: (view) => {
    persistWorkspace(view, view)
    set({
      activeView: view,
      teamsMode: view === 'teams',
    })
    useLayoutStore.setState({ primaryPane: view })
  },

  setViewMode: (mode) => {
    writeStorage(STORAGE_KEYS.viewMode, mode)
    set({ viewMode: mode })
  },

  setTeamsMode: (enabled) => {
    set((state) => {
      if (enabled) {
        persistWorkspace('teams', 'teams')
        useLayoutStore.setState({ primaryPane: 'teams' })
        return {
          teamsMode: true,
          activeView: 'teams',
        }
      }

      if (state.activeView === 'teams') {
        persistWorkspace('sessions', 'sessions')
        useLayoutStore.setState({ primaryPane: 'sessions' })
        const panelState = usePanelStore.getState()
        if (panelState.panelSides.sessions === 'left') {
          usePanelStore.setState({ activePanelLeft: 'sessions' })
        }
        return {
          teamsMode: false,
          activeView: 'sessions' as WorkspaceView,
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
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  toggleNewTaskDialog: () => set((state) => ({ showNewTaskDialog: !state.showNewTaskDialog })),
  setShowNewSessionDialog: (show) => set({ showNewSessionDialog: show }),
}))
