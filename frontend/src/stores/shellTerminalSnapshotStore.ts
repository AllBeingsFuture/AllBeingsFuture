import { create } from 'zustand'
import {
  terminalCore,
  type ShellDefinition,
  type ShellTab,
  type ShellTabLifecycle,
  type TerminalSnapshot,
} from '../core/terminal/terminalCore'

interface ShellTerminalState extends TerminalSnapshot {
  createTab: (shell?: string, cwd?: string) => Promise<string | null>
  closeTab: (id: string) => Promise<void>
  activateTab: (id: string) => void
  writeToTab: (id: string, data: string) => Promise<void>
  markExited: (id: string, code: number) => void
  setPanelVisibility: (visible: boolean) => void
  fetchShells: () => Promise<void>
  initListeners: () => () => void
}

function snapshotOf(state: ShellTerminalState): TerminalSnapshot {
  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    availableShells: state.availableShells,
    panelVisible: state.panelVisible,
  }
}

export const useShellTerminalStore = create<ShellTerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  availableShells: [],
  panelVisible: false,

  createTab: async (shell, cwd) => {
    const result = await terminalCore.create(snapshotOf(get()), shell, cwd)
    if (result.patch) set(result.patch)
    return result.tabId
  },

  closeTab: async (id) => {
    const patch = await terminalCore.close(snapshotOf(get()), id)
    if (patch) set(patch)
  },

  activateTab: (id) => {
    set(terminalCore.activate(snapshotOf(get()), id))
  },

  writeToTab: async (id, data) => {
    try {
      await terminalCore.write(id, data)
    } catch (err) {
      console.error('[ShellTerminal] writeToTab 失败:', err)
    }
  },

  markExited: (id, code) => {
    set(terminalCore.markExited(snapshotOf(get()), id, code))
  },

  setPanelVisibility: (visible) => {
    set(terminalCore.setPanelVisibility(snapshotOf(get()), visible))
  },

  fetchShells: async () => {
    set({ availableShells: await terminalCore.fetchShells() })
  },

  initListeners: () => (
    terminalCore.listenExit((ptyId, exitCode) => {
      get().markExited(ptyId, exitCode)
    })
  ),
}))

export type {
  ShellDefinition,
  ShellTab,
  ShellTabLifecycle,
}
