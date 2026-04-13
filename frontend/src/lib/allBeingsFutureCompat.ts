/**
 * AllBeingsFuture Compat API
 * Uses window.electronAPI (exposed via preload) for Electron IPC.
 */

const HISTORY_STATUSES = new Set(['completed', 'terminated', 'interrupted', 'error'])

const api = () => window.electronAPI

type ShortcutName =
  | 'view-mode'
  | 'cycle-terminal'
  | 'new-session'
  | 'new-task-session'
  | 'toggle-sidebar'
  | 'toggle-shell-panel'
  | 'quick-open'
  | 'replace-in-files'

type ShortcutHandler<T = unknown> = (payload: T) => void

export interface AllBeingsFutureCompatAPI {
  provider: {
    getAll: () => Promise<unknown[]>
    testExecutable: (providerId: string, executablePath: string) => Promise<boolean>
  }
  session: {
    getAll: () => Promise<unknown[]>
    getHistory: () => Promise<unknown[]>
    create: (config: Record<string, unknown>) => Promise<unknown>
    terminate: (sessionId: string) => Promise<void>
    getConversation: (sessionId: string) => Promise<unknown[]>
    getQueue: (sessionId: string) => Promise<unknown[]>
    clearQueue: (sessionId: string) => Promise<void>
  }
  app: {
    quit: () => Promise<void>
    selectDirectory: () => Promise<string>
    selectFile: () => Promise<string[]>
    openInExplorer: (targetPath: string) => Promise<void>
    openInTerminal: (targetPath: string) => Promise<void>
  }
  clipboard: {
    writeText: (text: string) => Promise<void>
    readText: () => Promise<string>
  }
  update: {
    getState: () => Promise<unknown>
    checkForUpdates: (manual: boolean) => Promise<unknown>
    openDownloadPage: () => Promise<string>
  }
  log: {
    getRecent: (limit?: number) => Promise<unknown[]>
    openFile: () => Promise<void>
  }
  pty: {
    getShells: () => Promise<Array<{ id: string; name: string; path: string }>>
    create: (opts: { shell?: string; cwd?: string }) => Promise<{ id: string; shell: string; error?: string }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (handler: (id: string, data: string) => void) => () => void
    onExit: (handler: (id: string, exitCode: number) => void) => () => void
  }
  shortcut: {
    configureFeatureShortcuts: (config: Record<string, boolean>) => void
    onViewMode: (handler: ShortcutHandler<string>) => () => void
    onCycleTerminal: (handler: ShortcutHandler<void>) => () => void
    onNewSession: (handler: ShortcutHandler<void>) => () => void
    onNewTaskSession: (handler: ShortcutHandler<void>) => () => void
    onToggleSidebar: (handler: ShortcutHandler<void>) => () => void
    onToggleShellPanel: (handler: ShortcutHandler<void>) => () => void
    onQuickOpen: (handler: ShortcutHandler<void>) => () => void
    onReplaceInFiles: (handler: ShortcutHandler<void>) => () => void
    dispose: () => void
  }
}

declare global {
  interface Window {
    allBeingsFuture: AllBeingsFutureCompatAPI
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      once: (channel: string, callback: (...args: any[]) => void) => void
      send: (channel: string, ...args: any[]) => void
      getPathForFile?: (file: File) => string
    }
  }
}

function shortcutEventName(name: ShortcutName) {
  return `allbeingsfuture-shortcut:${name}`
}

function onShortcut<T>(name: ShortcutName, handler: ShortcutHandler<T>) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<T>).detail)
  }

  window.addEventListener(shortcutEventName(name), listener as EventListener)
  return () => window.removeEventListener(shortcutEventName(name), listener as EventListener)
}

export function dispatchCompatShortcut<T>(name: ShortcutName, detail?: T) {
  window.dispatchEvent(new CustomEvent(shortcutEventName(name), { detail }))
}

export function installAllBeingsFutureCompat() {
  if (typeof window === 'undefined' || window.allBeingsFuture) {
    return window?.allBeingsFuture
  }

  const cleanupFns: Array<() => void> = []

  function trackedOnShortcut<T>(name: ShortcutName, handler: ShortcutHandler<T>) {
    const cleanup = onShortcut(name, handler)
    cleanupFns.push(cleanup)
    return () => {
      cleanup()
      const idx = cleanupFns.indexOf(cleanup)
      if (idx >= 0) cleanupFns.splice(idx, 1)
    }
  }


  window.allBeingsFuture = {
    provider: {
      getAll: async () => (await api().invoke('ProviderService.GetAll')) ?? [],
      testExecutable: async (providerId, executablePath) =>
        Boolean(await api().invoke('ProviderService.TestExecutable', providerId, executablePath)),
    },
    session: {
      getAll: async () => (await api().invoke('SessionService.GetAll')) ?? [],
      getHistory: async () => {
        const sessions = (await api().invoke('SessionService.GetAll')) ?? []
        return sessions.filter((session: any) => HISTORY_STATUSES.has(session.status))
      },
      create: async (config) => api().invoke('SessionService.Create', config),
      terminate: async (sessionId) => {
        try {
          await api().invoke('ProcessService.StopProcess', sessionId)
        } finally {
          await api().invoke('SessionService.End', sessionId)
        }
      },
      getConversation: async (sessionId) => {
        const state = await api().invoke('ProcessService.GetChatState', sessionId)
        return state?.messages ?? []
      },
      getQueue: async () => [],
      clearQueue: async () => {},
    },
    app: {
      quit: () => api().invoke('app:quit'),
      selectDirectory: () => api().invoke('app:selectDirectory'),
      selectFile: () => api().invoke('app:selectFile'),
      openInExplorer: (targetPath) => targetPath ? api().invoke('app:openInExplorer', targetPath) : Promise.resolve(),
      openInTerminal: (targetPath) => targetPath ? api().invoke('app:openInTerminal', targetPath) : Promise.resolve(),
    },
    clipboard: {
      writeText: (text) => api().invoke('clipboard:writeText', text),
      readText: () => api().invoke('clipboard:readText'),
    },
    update: {
      getState: () => api().invoke('UpdateService.GetState'),
      checkForUpdates: (manual) => api().invoke('UpdateService.CheckForUpdates', manual),
      openDownloadPage: () => api().invoke('UpdateService.OpenDownloadPage'),
    },
    log: {
      getRecent: async (limit?: number) => {
        const entries = await api().invoke('LogService.GetRecent', limit ?? 300)
        return entries ?? []
      },
      openFile: async () => {
        const logPath = await api().invoke('LogService.GetLogFilePath')
        if (logPath) await api().invoke('app:openInExplorer', logPath)
      },
    },
    pty: {
      getShells: () => api().invoke('PTYService.GetShells'),
      create: (opts) => api().invoke('PTYService.Create', opts.shell ?? '', opts.cwd ?? ''),
      write: (id, data) => api().invoke('PTYService.Write', id, data),
      resize: (id, cols, rows) => api().invoke('PTYService.Resize', id, cols, rows),
      kill: (id) => api().invoke('PTYService.Kill', id),
      onData: (handler) => {
        return api().on('pty:data', (payload: any) => {
          const { id, data } = payload ?? {}
          if (id && data) handler(id, data)
        })
      },
      onExit: (handler) => {
        return api().on('pty:exit', (payload: any) => {
          const { id, exitCode } = payload ?? {}
          if (id !== undefined) handler(id, exitCode ?? 0)
        })
      },
    },
    shortcut: {
      configureFeatureShortcuts: () => {},
      onViewMode: (handler) => trackedOnShortcut('view-mode', handler),
      onCycleTerminal: (handler) => trackedOnShortcut('cycle-terminal', handler),
      onNewSession: (handler) => trackedOnShortcut('new-session', handler),
      onNewTaskSession: (handler) => trackedOnShortcut('new-task-session', handler),
      onToggleSidebar: (handler) => trackedOnShortcut('toggle-sidebar', handler),
      onToggleShellPanel: (handler) => trackedOnShortcut('toggle-shell-panel', handler),
      onQuickOpen: (handler) => trackedOnShortcut('quick-open', handler),
      onReplaceInFiles: (handler) => trackedOnShortcut('replace-in-files', handler),
      dispose: () => {
        for (const fn of cleanupFns.splice(0)) fn()
      },
    },
  }

  return window.allBeingsFuture
}
