/**
 * Electron Preload Script (CommonJS)
 *
 * Exposes a safe IPC bridge to the renderer process via contextBridge.
 * Must be CJS to work reliably inside asar in packaged Electron apps.
 */

const { contextBridge, ipcRenderer } = require('electron')

const electronAPI = {
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel, callback) => {
    const listener = (_event, ...args) => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  once: (channel, callback) => {
    ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args)
    })
  },

  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args)
  },

  quickOpen: {
    search: (rootDir, query) => ipcRenderer.invoke('QuickOpen.Search', rootDir, query),
    openFile: (filePath) => ipcRenderer.invoke('QuickOpen.OpenFile', filePath),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
