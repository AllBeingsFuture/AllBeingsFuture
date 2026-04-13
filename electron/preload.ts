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

  quickOpen: {
    search: (rootDir: string, query: string) => ipcRenderer.invoke('QuickOpen.Search', rootDir, query),
    openFile: (filePath: string) => ipcRenderer.invoke('QuickOpen.OpenFile', filePath),
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

// ---- Drop Safety Net ----
// Prevent the browser from navigating to dropped files.
// All file handling is done in React's onDrop handler (MessageInput).
document.addEventListener('dragover', (event) => {
  event.preventDefault()
})
document.addEventListener('drop', (event) => {
  event.preventDefault()
})

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI
