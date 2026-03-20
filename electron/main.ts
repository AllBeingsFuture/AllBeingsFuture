/**
 * AllBeingsFuture - Electron Main Process
 *
 * Electron Main Process. Manages:
 * - BrowserWindow lifecycle
 * - SQLite database (better-sqlite3)
 * - AI Provider Bridge (directly integrated, no subprocess)
 * - IPC handlers for all services
 * - System tray, single instance, PTY
 */

import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from './services/database.js'
import { registerAllIpcHandlers } from './ipc/handlers.js'
import { BridgeManager } from './bridge/bridge.js'
import type { ProcessService } from './services/process.js'
import { TrayManager } from './services/tray-manager.js'
import { NotificationManager } from './services/notification-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---- Global Error Handlers ----
// Prevent "write EOF" and similar async stream errors from crashing the entire app.
// These errors typically occur when a child process (Claude SDK, Codex, MCP server)
// exits while its stdin pipe is still being written to.
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err)
  // Stream write errors (write EOF, write EPIPE) are non-fatal — the session
  // that owned the dead process will receive an error/exit event separately.
  if (/write (EOF|EPIPE)|ECONNRESET|EPIPE|channel closed/i.test(msg)) {
    console.error('[main] Non-fatal stream error (suppressed):', msg)
    return
  }
  // For truly unexpected errors, log but don't crash — let Electron handle it
  console.error('[main] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  if (/write (EOF|EPIPE)|ECONNRESET|EPIPE|channel closed/i.test(msg)) {
    console.error('[main] Non-fatal unhandled rejection (suppressed):', msg)
    return
  }
  console.error('[main] Unhandled rejection:', reason)
})

// ---- Single Instance Lock ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
let notificationManager: NotificationManager | null = null
let db: Database | null = null
let bridgeManager: BridgeManager | null = null
let processService: ProcessService | null = null

const isDev = !app.isPackaged

function getPreloadPath() {
  if (isDev) {
    return path.join(__dirname, 'preload.js')
  }
  return path.join(__dirname, '..', 'preload.cjs')
}

function getRendererUrl() {
  if (isDev) {
    return 'http://localhost:5173'
  }
  return `file://${path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html')}`
}

function getIconPath() {
  return path.join(__dirname, '..', 'appicon.ico')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: getIconPath(),
    title: 'AllBeingsFuture',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e0e0e0',
      height: 36,
    },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.loadURL(getRendererUrl())

  // Safety net: intercept file:// navigations caused by unhandled file drops.
  // If a drop event's preventDefault() somehow fails, the browser will try to
  // navigate to the dropped file. Catch that here and relay as files-dropped.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault()
      try {
        const filePath = decodeURIComponent(url.replace(/^file:\/\/\//, ''))
        if (filePath) {
          mainWindow?.webContents.send('files-dropped', [filePath])
        }
      } catch { /* ignore malformed URLs */ }
    }
  })

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (trayManager) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  // Initialize TrayManager (full-featured tray with badge, session count, etc.)
  trayManager = new TrayManager()
  trayManager.init(mainWindow!)
}

// ---- App Lifecycle ----

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  // Initialize database
  db = new Database()

  // Initialize bridge manager
  bridgeManager = new BridgeManager()

  // Register all IPC handlers
  const services = registerAllIpcHandlers(db, bridgeManager, () => mainWindow)
  const botPushService = services.botPushService
  processService = services.processService

  // Register app-level IPC handlers
  registerAppIpcHandlers()

  // Initialize notification manager and wire bot push
  notificationManager = new NotificationManager(() => mainWindow)
  notificationManager.setBotPushService(botPushService)

  // Create window and tray
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  // On Windows, keep app running in tray
  if (process.platform !== 'darwin' && !trayManager) {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Destroy tray icon
  trayManager?.destroy()
  trayManager = null

  // Clean up parser / state inference timers
  processService?.cleanup()
  processService = null

  // Clean up bridge sessions
  bridgeManager?.destroyAll()

  // Close database
  db?.close()
})

// ---- App-level IPC Handlers ----

function registerAppIpcHandlers() {
  ipcMain.handle('app:quit', () => {
    trayManager?.destroy()
    trayManager = null
    app.quit()
  })

  ipcMain.handle('app:selectDirectory', async () => {
    if (!mainWindow) return ''
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择目录',
    })
    return result.filePaths[0] || ''
  })

  ipcMain.handle('app:selectFile', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: '选择文件',
    })
    return result.filePaths
  })

  ipcMain.handle('app:openInExplorer', async (_e, targetPath: string) => {
    if (targetPath) shell.showItemInFolder(targetPath)
  })

  ipcMain.handle('app:openInTerminal', async (_e, targetPath: string) => {
    if (targetPath) shell.openPath(targetPath)
  })

  ipcMain.handle('clipboard:writeText', async (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('clipboard:readText', async () => {
    return clipboard.readText()
  })

  // Tray manager: session status updates
  ipcMain.handle('tray:updateSessionCount', (_e, count: number) => {
    trayManager?.onSessionStatusChange(count)
  })

  // Notification manager IPC
  ipcMain.handle('notificationManager:notify', (_e, type: string, sessionId: string, sessionName: string, detail?: string) => {
    notificationManager?.notify(type as any, sessionId, sessionName, detail)
  })
  ipcMain.handle('notificationManager:setDND', (_e, enabled: boolean, startTime?: string, endTime?: string) => {
    notificationManager?.setDND(enabled, startTime, endTime)
  })
  ipcMain.handle('notificationManager:setTypeEnabled', (_e, type: string, enabled: boolean) => {
    notificationManager?.setTypeEnabled(type as any, enabled)
  })
  ipcMain.handle('notificationManager:setSoundEnabled', (_e, enabled: boolean) => {
    notificationManager?.setSoundEnabled(enabled)
  })
  ipcMain.handle('notificationManager:setEnabled', (_e, enabled: boolean) => {
    notificationManager?.setEnabled(enabled)
  })
  ipcMain.handle('notificationManager:getConfig', () => {
    return notificationManager?.getConfig() ?? null
  })
  ipcMain.handle('notificationManager:acknowledge', (_e, sessionId: string, type?: string) => {
    notificationManager?.acknowledge(sessionId, type as any)
  })

  // Relay native file/folder drop paths from preload → renderer
  // The preload captures File.path (reliable in its privileged context)
  // and forwards here; we echo back as 'files-dropped' for the renderer to consume.
  ipcMain.on('native-files-dropped', (event, paths: string[]) => {
    event.sender.send('files-dropped', paths)
  })

  // Window controls (for custom title bar)
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
}
