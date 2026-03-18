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

import { contextBridge, ipcRenderer } from 'electron'

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
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI
