import { create } from 'zustand'

import type { PanelId, PanelSide } from './ui-helpers'
import {
  STORAGE_KEYS,
  WORKSPACE_PANEL_MAP,
  firstPanelForSide,
  isBooleanString,
  isWorkspacePanel,
  persistPanelSides,
  persistWorkspace,
  readPanelSides,
  readStorage,
  resolvePanelId,
  writeStorage,
} from './ui-helpers'
import { useLayoutStore } from './layoutStore'
import { useUIStore } from './uiStore'

export type PanelLifecycleState = 'active' | 'inactive' | 'frozen'
export type RuntimePanelId = 'sidebar' | 'detail'

export interface PanelStateSnapshot {
  panelSides: Record<PanelId, PanelSide>
  activePanelLeft: PanelId
  activePanelRight: PanelId
  sidebarCollapsed: boolean
  detailPanelCollapsed: boolean
  panelRuntime: Record<RuntimePanelId, PanelLifecycleState>
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
  setPanelRuntimeState: (panelId: RuntimePanelId, nextState: PanelLifecycleState) => void
  setSidebarWidth: (width: number) => void
  setDetailPanelWidth: (width: number) => void
  toggleFloatingPanel: (id: string) => void
  closeFloatingPanel: (id: string) => void
}

function derivePanelRuntime(
  sidebarCollapsed: boolean,
  detailPanelCollapsed: boolean,
): Record<RuntimePanelId, PanelLifecycleState> {
  return {
    sidebar: sidebarCollapsed ? 'frozen' : 'inactive',
    detail: detailPanelCollapsed ? 'frozen' : 'inactive',
  }
}

/**
 * Clear legacy independent-shell terminal persistence so upgrades never reopen it.
 * Old values (shellPanelVisible / shell tabs) are discarded; panel stays closed.
 */
export function clearLegacyShellPanelPersistence(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(STORAGE_KEYS.shellPanelVisible)
  } catch {
    // ignore storage errors
  }
}

export function createDefaultPanelState(): PanelStateSnapshot {
  // Always normalize away legacy shell-terminal visibility on load.
  clearLegacyShellPanelPersistence()

  const panelSides = readPanelSides()
  const sidebarCollapsed = readStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false, isBooleanString)
  // 右侧详情面板（活动时间线）已从布局移除，始终视为收起
  const detailPanelCollapsed = true

  // Resolve via resolvePanelId so any legacy active id (e.g. tools/explorer/git) never becomes blank/invalid.
  const activePanelLeft = resolvePanelId(
    firstPanelForSide(panelSides, 'left', 'sessions'),
    'sessions',
  )
  const activePanelRight = resolvePanelId(
    firstPanelForSide(panelSides, 'right', 'timeline'),
    'timeline',
  )

  return {
    panelSides,
    activePanelLeft,
    activePanelRight,
    sidebarCollapsed,
    detailPanelCollapsed,
    panelRuntime: derivePanelRuntime(sidebarCollapsed, detailPanelCollapsed),
    sidebarWidth: 280,
    detailPanelWidth: 320,
    floatingPanels: {},
  }
}

export const usePanelStore = create<PanelState>((set) => ({
  ...createDefaultPanelState(),

  setPanelSide: (panelId, side) => {
    const safePanelId = resolvePanelId(panelId, side === 'left' ? 'sessions' : 'timeline')
    set((state) => {
      if (state.panelSides[safePanelId] === side) {
        return state
      }

      const panelSides = { ...state.panelSides, [safePanelId]: side }
      persistPanelSides(panelSides)

      let activePanelLeft = resolvePanelId(state.activePanelLeft, 'sessions')
      let activePanelRight = resolvePanelId(state.activePanelRight, 'timeline')
      const nextState: Partial<PanelStateSnapshot> = { panelSides }

      if (side === 'left') {
        activePanelLeft = safePanelId
        if (activePanelRight === safePanelId) {
          activePanelRight = firstPanelForSide(panelSides, 'right', 'timeline')
        }
        nextState.sidebarCollapsed = false
        nextState.panelRuntime = {
          ...state.panelRuntime,
          sidebar: 'active',
        }
      } else {
        activePanelRight = safePanelId
        if (activePanelLeft === safePanelId) {
          activePanelLeft = firstPanelForSide(panelSides, 'left', 'sessions')
        }
        nextState.detailPanelCollapsed = false
        nextState.panelRuntime = {
          ...state.panelRuntime,
          detail: 'active',
        }
      }

      nextState.activePanelLeft = activePanelLeft
      nextState.activePanelRight = activePanelRight

      if (side === 'left' && isWorkspacePanel(safePanelId)) {
        const view = WORKSPACE_PANEL_MAP[safePanelId]
        persistWorkspace(view, view)
        useUIStore.setState({ activeView: view, teamsMode: false })
        useLayoutStore.setState({ primaryPane: view })
      }

      return nextState as PanelState
    })
  },

  setActivePanelLeft: (panelId) => {
    const safePanelId = resolvePanelId(panelId, 'sessions')
    if (!isWorkspacePanel(safePanelId)) {
      set((state) => ({
        activePanelLeft: safePanelId,
        sidebarCollapsed: false,
        panelRuntime: {
          ...state.panelRuntime,
          sidebar: 'active',
        },
      }))
      return
    }

    const view = WORKSPACE_PANEL_MAP[safePanelId]
    persistWorkspace(view, view)
    set((state) => ({
      activePanelLeft: safePanelId,
      sidebarCollapsed: false,
      panelRuntime: {
        ...state.panelRuntime,
        sidebar: 'active',
      },
    }))
    useUIStore.setState({ activeView: view, teamsMode: false })
    useLayoutStore.setState({ primaryPane: view })
  },

  setActivePanelRight: (panelId) => {
    const safePanelId = resolvePanelId(panelId, 'timeline')
    set((state) => ({
      activePanelRight: safePanelId,
      detailPanelCollapsed: false,
      panelRuntime: {
        ...state.panelRuntime,
        detail: 'active',
      },
    }))
  },

  toggleSidebar: () => {
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed
      writeStorage(STORAGE_KEYS.sidebarCollapsed, String(sidebarCollapsed))
      return {
        sidebarCollapsed,
        panelRuntime: {
          ...state.panelRuntime,
          sidebar: sidebarCollapsed ? 'frozen' : 'active',
        },
      }
    })
  },

  toggleDetailPanel: () => {
    set((state) => {
      const detailPanelCollapsed = !state.detailPanelCollapsed
      writeStorage(STORAGE_KEYS.detailPanelCollapsed, String(detailPanelCollapsed))
      return {
        detailPanelCollapsed,
        panelRuntime: {
          ...state.panelRuntime,
          detail: detailPanelCollapsed ? 'frozen' : 'active',
        },
      }
    })
  },

  setPanelRuntimeState: (panelId, nextState) => {
    set((state) => ({
      panelRuntime: {
        ...state.panelRuntime,
        [panelId]: nextState,
      },
    }))
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
