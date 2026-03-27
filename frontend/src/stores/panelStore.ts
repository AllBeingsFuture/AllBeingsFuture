import { create } from 'zustand'

import type { PanelId, PanelSide } from './ui-helpers'
import {
  ALL_PANEL_IDS,
  STORAGE_KEYS,
  WORKSPACE_PANEL_MAP,
  firstPanelForSide,
  isBooleanString,
  isWorkspacePanel,
  persistPanelSides,
  persistWorkspace,
  readPanelSides,
  readStorage,
  writeStorage,
} from './ui-helpers'
import { useLayoutStore } from './layoutStore'
import { useUIStore } from './uiStore'

export interface PanelStateSnapshot {
  panelSides: Record<PanelId, PanelSide>
  activePanelLeft: PanelId
  activePanelRight: PanelId
  sidebarCollapsed: boolean
  detailPanelCollapsed: boolean
  shellPanelVisible: boolean
  sidebarWidth: number
  detailPanelWidth: number
  floatingPanels: Record<string, boolean>
}

interface PanelState extends PanelStateSnapshot {
  setPanelSide: (panelId: PanelId, side: PanelSide) => void
  setActivePanelLeft: (panelId: PanelId) => void
  setActivePanelRight: (panelId: PanelId) => void
  toggleSidebar: () => void
  toggleDetailPanel: () => void
  toggleShellPanel: () => void
  setSidebarWidth: (width: number) => void
  setDetailPanelWidth: (width: number) => void
  toggleFloatingPanel: (id: string) => void
  closeFloatingPanel: (id: string) => void
}

export function createDefaultPanelState(): PanelStateSnapshot {
  const panelSides = readPanelSides()

  return {
    panelSides,
    activePanelLeft: firstPanelForSide(panelSides, 'left', 'sessions'),
    activePanelRight: firstPanelForSide(panelSides, 'right', 'timeline'),
    sidebarCollapsed: readStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false, isBooleanString),
    detailPanelCollapsed: readStorage<boolean>(STORAGE_KEYS.detailPanelCollapsed, false, isBooleanString),
    shellPanelVisible: readStorage<boolean>(STORAGE_KEYS.shellPanelVisible, false, isBooleanString),
    sidebarWidth: 280,
    detailPanelWidth: 320,
    floatingPanels: {},
  }
}

export const usePanelStore = create<PanelState>((set, get) => ({
  ...createDefaultPanelState(),

  setPanelSide: (panelId, side) => {
    set((state) => {
      if (state.panelSides[panelId] === side) {
        return state
      }

      const panelSides = { ...state.panelSides, [panelId]: side }
      persistPanelSides(panelSides)

      let activePanelLeft = state.activePanelLeft
      let activePanelRight = state.activePanelRight
      const nextState: Partial<PanelStateSnapshot> = { panelSides }

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
        const view = WORKSPACE_PANEL_MAP[panelId]
        persistWorkspace(view, view)
        useUIStore.setState({ activeView: view, teamsMode: false })
        useLayoutStore.setState({ primaryPane: view })
      }

      return nextState as PanelState
    })
  },

  setActivePanelLeft: (panelId) => {
    if (!isWorkspacePanel(panelId)) {
      set({ activePanelLeft: panelId, sidebarCollapsed: false })
      return
    }

    const view = WORKSPACE_PANEL_MAP[panelId]
    persistWorkspace(view, view)
    set({ activePanelLeft: panelId, sidebarCollapsed: false })
    useUIStore.setState({ activeView: view, teamsMode: false })
    useLayoutStore.setState({ primaryPane: view })
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

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),

  toggleFloatingPanel: (id) => set((state) => ({
    floatingPanels: { ...state.floatingPanels, [id]: !state.floatingPanels[id] },
  })),

  closeFloatingPanel: (id) => set((state) => ({
    floatingPanels: { ...state.floatingPanels, [id]: false },
  })),
}))
