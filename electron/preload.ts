/**
 * Electron Preload Script
 *
 * Exposes a safe IPC bridge to the renderer process via contextBridge.
 *
 * The renderer calls window.electronAPI.invoke(channel, ...args)
 * which maps to ipcMain.handle(channel, ...) in the main process.
 *
 * Also provides event listening for push events from main → renderer.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'

// ---- IPC Bridge ----

const electronAPI = {
  /**
   * Generic invoke: calls ipcMain.handle(channel, ...args)
   * All service bindings use this.
   */
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * Listen to events pushed from main process.
   * Returns an unsubscribe function.
   */
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  /**
   * Listen to an event once.
   */
  once: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args)
    })
  },

  /**
   * Send a one-way message to main (no response).
   */
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },

  /**
   * Get the file system path for a File object (Electron 29+).
   * Returns empty string if the File has no backing path.
   */
  getPathForFile: (file: File): string => {
    try {
      const p = webUtils.getPathForFile(file)
      if (p) return p
    } catch { /* ignore */ }
    return (file as any).path || ''
  },
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// ---- Utility: get file path from a File object ----
// Electron 29+ recommends webUtils.getPathForFile() over the deprecated File.path.
// webUtils.getPathForFile() works reliably with contextIsolation.
function getFilePath(file: File): string {
  try {
    const p = webUtils.getPathForFile(file)
    if (p) return p
  } catch { /* ignore */ }
  // Fallback for older Electron or edge cases
  return (file as any).path || ''
}

// ---- Native File/Folder Drop Handler ----
// In contextIsolation mode, the renderer's File objects lose the Electron-specific
// `.path` property. We use webUtils.getPathForFile() (Electron 29+) to reliably
// extract file paths and relay them via IPC → main → renderer ('files-dropped').

// Global dragover prevention — required for the browser to allow drop events.
// Without this, the default behavior is to deny drops (and navigate to the file).
document.addEventListener('dragover', (event) => {
  event.preventDefault()
})

// Use capture phase so this fires BEFORE React's synthetic event handler,
// ensuring we extract file paths before any other handler might clear dataTransfer.
document.addEventListener('drop', (event) => {
  event.preventDefault()

  const paths: string[] = []
  const seen = new Set<string>()

  const addPath = (p: string | undefined | null) => {
    if (p && !seen.has(p)) {
      seen.add(p)
      paths.push(p)
    }
  }

  // 1. Try FileList (standard approach)
  const files = event.dataTransfer?.files
  if (files) {
    for (let i = 0; i < files.length; i++) {
      addPath(getFilePath(files[i]))
    }
  }

  // 2. Fallback: items API — handles edge cases where FileList misses entries
  //    (e.g., folders on some Windows/Electron versions)
  if (event.dataTransfer?.items) {
    for (let i = 0; i < event.dataTransfer.items.length; i++) {
      const item = event.dataTransfer.items[i]
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) addPath(getFilePath(file))
    }
  }

  if (paths.length > 0) {
    ipcRenderer.send('native-files-dropped', paths)
  }
}, true)

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI
