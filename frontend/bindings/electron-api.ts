/**
 * Electron IPC API
 *
 * Typed wrappers around window.electronAPI exposed by the preload script.
 * All service bindings and UI code should import from this module
 * instead of using window.electronAPI directly.
 */

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      once: (channel: string, callback: (...args: any[]) => void) => void
      send: (channel: string, ...args: any[]) => void
      getPathForFile?: (file: File) => string
    }
  }
}

/** Invoke an IPC handler on the main process. */
export function ipc(channel: string, ...args: any[]): Promise<any> {
  return window.electronAPI.invoke(channel, ...args)
}

/** Listen for events pushed from the main process. Returns a cleanup function. */
export function onIpc(channel: string, callback: (...args: any[]) => void): () => void {
  return window.electronAPI.on(channel, callback)
}

/** Send a one-way message to the main process. */
export function emitIpc(channel: string, ...args: any[]): void {
  window.electronAPI.send(channel, ...args)
}

// ---- Type creation helpers ----

export function createNullable<T>(createFn: (source: any) => T) {
  return (value: any): T | null => {
    if (value === null || value === undefined) return null
    return createFn(value)
  }
}

export function createArray<T>(createFn: (source: any) => T) {
  return (arr: any): T[] => {
    if (!Array.isArray(arr)) return []
    return arr.map((item: any) => createFn(item))
  }
}

export function createMap<K, V>(keyFn: (k: any) => K, valFn: (v: any) => V) {
  return (obj: any): Map<K, V> => {
    const map = new Map<K, V>()
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        map.set(keyFn(k), valFn(v))
      }
    }
    return map
  }
}

export function identity<T>(value: T): T {
  return value
}

export function toByteSlice(value: any): string {
  return typeof value === 'string' ? value : ''
}

// ---- Desktop APIs ----

export const AppAPI = {
  quit: (): Promise<void> => ipc('app:quit'),
  selectDirectory: (): Promise<string> => ipc('app:selectDirectory'),
  selectFile: (): Promise<string[]> => ipc('app:selectFile'),
  openInExplorer: (path: string): Promise<void> => ipc('app:openInExplorer', path),
  openInTerminal: (path: string): Promise<void> => ipc('app:openInTerminal', path),
  openExternal: (url: string): Promise<void> => ipc('app:openExternal', url),
}

export const ClipboardAPI = {
  writeText: (text: string): Promise<void> => ipc('clipboard:writeText', text),
  readText: (): Promise<string> => ipc('clipboard:readText'),
}

export const WindowAPI = {
  minimize: (): Promise<void> => ipc('window:minimize'),
  maximize: (): Promise<void> => ipc('window:maximize'),
  close: (): Promise<void> => ipc('window:close'),
  isMaximized: (): Promise<boolean> => ipc('window:isMaximized'),
}
