/**
 * Shell 终端状态管理 Store
 *
 * 管理独立于 AI 会话的 Shell 终端标签页状态。
 * 通过 window.allBeingsFuture.pty API 与 Go PTYService 通信。
 */

import { create } from 'zustand'
import { useSessionStore } from './sessionStore'

export interface ShellDefinition {
  id: string
  name: string
  path: string
}

export interface ShellTab {
  id: string
  title: string
  shell: string
  cwd: string
  exitCode?: number
}

interface ShellTerminalState {
  tabs: ShellTab[]
  activeTabId: string | null
  availableShells: ShellDefinition[]

  createTab: (shell?: string, cwd?: string) => Promise<void>
  closeTab: (id: string) => Promise<void>
  activateTab: (id: string) => void
  markExited: (id: string, code: number) => void
  fetchShells: () => Promise<void>
  initListeners: () => () => void
}

const MAX_TABS = 8

export const useShellTerminalStore = create<ShellTerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  availableShells: [],

  createTab: async (shell?: string, cwd?: string) => {
    const { tabs } = get()
    if (tabs.length >= MAX_TABS) return

    const resolvedCwd = cwd || getDefaultCwd()

    try {
      const api = window.allBeingsFuture?.pty
      if (!api?.create) {
        console.warn('[ShellTerminal] PTY API not available')
        return
      }

      const result = await api.create({ shell, cwd: resolvedCwd })

      if (result.error) {
        console.error('[ShellTerminal] 创建失败:', result.error)
        return
      }

      const { id, shell: actualShell } = result
      const title = shellDisplayName(actualShell)

      set((s) => ({
        tabs: [...s.tabs, { id, title, shell: actualShell, cwd: resolvedCwd }],
        activeTabId: id,
      }))
    } catch (err) {
      console.error('[ShellTerminal] 创建异常:', err)
    }
  },

  closeTab: async (id: string) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find(t => t.id === id)
    if (!tab) return

    if (tab.exitCode === undefined) {
      try {
        const api = window.allBeingsFuture?.pty
        await api?.kill?.(id)
      } catch { /* may have already exited */ }
    }

    const remaining = tabs.filter(t => t.id !== id)
    let nextActiveId = activeTabId

    if (activeTabId === id) {
      const idx = tabs.findIndex(t => t.id === id)
      nextActiveId = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
    }

    set({ tabs: remaining, activeTabId: nextActiveId })
  },

  activateTab: (id: string) => {
    set({ activeTabId: id })
  },

  markExited: (id: string, code: number) => {
    set((s) => ({
      tabs: s.tabs.map(t => t.id === id ? { ...t, exitCode: code } : t),
    }))
  },

  fetchShells: async () => {
    try {
      const api = window.allBeingsFuture?.pty
      if (!api?.getShells) return
      const shells = await api.getShells()
      set({ availableShells: shells ?? [] })
    } catch (err) {
      console.error('[ShellTerminal] fetchShells 失败:', err)
    }
  },

  initListeners: () => {
    const api = window.allBeingsFuture?.pty
    if (!api?.onExit) return () => {}

    const cleanupExit = api.onExit(
      (ptyId: string, exitCode: number) => {
        get().markExited(ptyId, exitCode)
      }
    )
    return cleanupExit
  },
}))

function getDefaultCwd(): string {
  const { sessions, selectedId } = useSessionStore.getState()
  if (selectedId) {
    const s = sessions.find((x: any) => x.id === selectedId)
    if (s?.workingDirectory) return s.workingDirectory
  }
  // Fallback: use any session's workingDirectory
  for (const s of sessions) {
    if ((s as any).workingDirectory) return (s as any).workingDirectory
  }
  return ''
}

function shellDisplayName(shellPath: string): string {
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
