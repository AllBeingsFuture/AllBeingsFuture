export interface ShellDefinition {
  id: string
  name: string
  path: string
}

export type ShellTabLifecycle = 'active' | 'inactive' | 'frozen'

export interface ShellTab {
  id: string
  title: string
  shell: string
  cwd: string
  lifecycle: ShellTabLifecycle
  exitCode?: number
}

export interface TerminalSnapshot {
  tabs: ShellTab[]
  activeTabId: string | null
  availableShells: ShellDefinition[]
  panelVisible: boolean
}

const MAX_TABS = 8

function ptyApi() {
  return window.allBeingsFuture?.pty
}

function shellDisplayName(shellPath: string) {
  const base = shellPath.replace(/\\/g, '/').split('/').pop() || shellPath
  const name = base.replace(/\.exe$/i, '')
  const displayNames: Record<string, string> = {
    pwsh: 'PowerShell 7',
    powershell: 'PowerShell',
    cmd: 'CMD',
    bash: 'Bash',
    zsh: 'Zsh',
    fish: 'Fish',
    wsl: 'WSL',
  }
  return displayNames[name.toLowerCase()] || name
}

function reconcileTabLifecycles(
  tabs: ShellTab[],
  activeTabId: string | null,
  panelVisible: boolean,
): ShellTab[] {
  return tabs.map((tab) => ({
    ...tab,
    lifecycle: !panelVisible ? 'frozen' : tab.id === activeTabId ? 'active' : 'inactive',
  }))
}

export const terminalCore = {
  reconcileTabLifecycles,

  async fetchShells() {
    try {
      const shells = await ptyApi()?.getShells?.()
      return shells ?? []
    } catch (err) {
      console.error('[ShellTerminal] fetchShells 失败:', err)
      return []
    }
  },

  async create(snapshot: TerminalSnapshot, shell?: string, cwd?: string) {
    if (snapshot.tabs.length >= MAX_TABS) return { tabId: null, patch: null }
    try {
      const result = await ptyApi()?.create?.({ shell, cwd: cwd ?? '' })
      if (!result || result.error) {
        if (result?.error) console.error('[ShellTerminal] 创建失败:', result.error)
        return { tabId: null, patch: null }
      }

      const tabId = result.id
      const nextTabs = reconcileTabLifecycles(
        [...snapshot.tabs, { id: tabId, title: shellDisplayName(result.shell), shell: result.shell, cwd: cwd ?? '', lifecycle: 'active' }],
        tabId,
        snapshot.panelVisible,
      )
      return { tabId, patch: { tabs: nextTabs, activeTabId: tabId } }
    } catch (err) {
      console.error('[ShellTerminal] 创建异常:', err)
      return { tabId: null, patch: null }
    }
  },

  async close(snapshot: TerminalSnapshot, id: string) {
    const tab = snapshot.tabs.find(item => item.id === id)
    if (!tab) return null
    if (tab.exitCode === undefined) {
      try { await ptyApi()?.kill?.(id) } catch {}
    }
    const remaining = snapshot.tabs.filter(item => item.id !== id)
    let nextActiveId = snapshot.activeTabId
    if (snapshot.activeTabId === id) {
      const closedIndex = snapshot.tabs.findIndex(item => item.id === id)
      nextActiveId = remaining[Math.min(closedIndex, remaining.length - 1)]?.id ?? null
    }
    return {
      tabs: reconcileTabLifecycles(remaining, nextActiveId, snapshot.panelVisible),
      activeTabId: nextActiveId,
    }
  },

  activate(snapshot: TerminalSnapshot, id: string) {
    return {
      activeTabId: id,
      tabs: reconcileTabLifecycles(snapshot.tabs, id, snapshot.panelVisible),
    }
  },

  markExited(snapshot: TerminalSnapshot, id: string, code: number) {
    return {
      tabs: snapshot.tabs.map(tab => tab.id === id ? { ...tab, exitCode: code } : tab),
    }
  },

  setPanelVisibility(snapshot: TerminalSnapshot, visible: boolean) {
    return {
      panelVisible: visible,
      tabs: reconcileTabLifecycles(snapshot.tabs, snapshot.activeTabId, visible),
    }
  },

  write: (id: string, data: string) => ptyApi()?.write?.(id, data),
  resize: (id: string, cols: number, rows: number) => ptyApi()?.resize?.(id, cols, rows),
  listenData: (handler: (id: string, data: string) => void) => ptyApi()?.onData?.(handler) || (() => {}),
  listenExit: (handler: (id: string, exitCode: number) => void) => ptyApi()?.onExit?.(handler) || (() => {}),
}

export type TerminalCore = typeof terminalCore
