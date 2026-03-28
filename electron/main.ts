/**
 * AllBeingsFuture - Electron Main Process
 *
 * Main responsibilities:
 * - BrowserWindow lifecycle
 * - SQLite database
 * - Provider bridge
 * - IPC handler registration
 * - Tray and notifications
 */

import { app, BrowserWindow, ipcMain, dialog, clipboard, shell, protocol, net } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Database } from './services/database.js'
import { registerAllIpcHandlers } from './ipc/handlers.js'
import { BridgeManager } from './bridge/bridge.js'
import type { ProcessService } from './services/process.js'
import { TrayManager } from './services/tray-manager.js'
import { NotificationManager } from './services/notification-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const STARTUP_LOG_DIR = path.join(os.homedir(), '.allbeingsfuture')
const STARTUP_LOG_PATH = path.join(STARTUP_LOG_DIR, 'startup.log')
const APP_SCHEME = 'app'
const isDev = !app.isPackaged

app.disableHardwareAcceleration()

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function logStartup(label: string, payload?: unknown) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null)
  const line = `[${new Date().toISOString()}] [${label}] ${serialized}\n`
  try {
    fs.mkdirSync(STARTUP_LOG_DIR, { recursive: true })
    fs.appendFileSync(STARTUP_LOG_PATH, line)
  } catch {
    // Ignore file logging failures.
  }
}

function resetStartupLog() {
  try {
    fs.mkdirSync(STARTUP_LOG_DIR, { recursive: true })
    if (fs.existsSync(STARTUP_LOG_PATH)) {
      fs.unlinkSync(STARTUP_LOG_PATH)
    }
  } catch {
    // Ignore cleanup failures.
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return String(error)
}

function getRendererRoot() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'frontend', 'dist')
  }

  return path.join(process.resourcesPath, 'frontend', 'dist')
}

function getRendererPath() {
  return path.join(getRendererRoot(), 'index.html')
}

function getPreloadPath() {
  if (isDev) {
    return path.join(__dirname, 'preload.js')
  }
  return path.join(__dirname, '..', 'preload.cjs')
}

function getIconPath() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'appicon.ico')
  }
  return path.join(process.resourcesPath, 'appicon.ico')
}

function resolveAppAssetPath(requestUrl: string) {
  const root = path.normalize(getRendererRoot())
  const { pathname } = new URL(requestUrl)
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const resolvedPath = path.normalize(path.join(root, relativePath))

  if (!resolvedPath.startsWith(root)) {
    throw new Error(`Blocked app protocol traversal: ${requestUrl}`)
  }

  return resolvedPath
}

async function registerAppProtocol() {
  if (isDev) return

  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const filePath = resolveAppAssetPath(request.url)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      logStartup('protocol-error', {
        url: request.url,
        error: serializeError(error),
      })
      return new Response('Not Found', { status: 404 })
    }
  })
}

process.on('uncaughtException', (error) => {
  const message = error?.message || String(error)
  if (/write (EOF|EPIPE)|ECONNRESET|EPIPE|channel closed/i.test(message)) {
    console.error('[main] Non-fatal stream error (suppressed):', message)
    logStartup('uncaught-exception-suppressed', message)
    return
  }

  console.error('[main] Uncaught exception:', error)
  logStartup('uncaught-exception', serializeError(error))
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/write (EOF|EPIPE)|ECONNRESET|EPIPE|channel closed/i.test(message)) {
    console.error('[main] Non-fatal unhandled rejection (suppressed):', message)
    logStartup('unhandled-rejection-suppressed', message)
    return
  }

  console.error('[main] Unhandled rejection:', reason)
  logStartup('unhandled-rejection', serializeError(reason))
})

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

async function loadRenderer(window: BrowserWindow) {
  if (isDev) {
    await window.loadURL('http://localhost:5173')
    return
  }

  await window.loadURL(`${APP_SCHEME}://frontend/index.html`)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1900,
    height: 1200,
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] Renderer failed to load:', { errorCode, errorDescription, validatedURL })
    logStartup('did-fail-load', { errorCode, errorDescription, validatedURL })
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error('[renderer]', { level, message, line, sourceId })
      logStartup('console-message', { level, message, line, sourceId })
    }
  })
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[main] Preload failed:', { preloadPath, error })
    logStartup('preload-error', { preloadPath, error: serializeError(error) })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] Renderer process gone:', details)
    logStartup('render-process-gone', details)
  })

  void loadRenderer(mainWindow).catch((error) => {
    console.error('[main] Failed to initialize renderer:', error)
    logStartup('load-renderer-error', serializeError(error))
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault()
      try {
        const filePath = decodeURIComponent(url.replace(/^file:\/\/\//, ''))
        if (filePath) {
          mainWindow?.webContents.send('files-dropped', [filePath])
        }
      } catch {
        // Ignore malformed URLs.
      }
    }
  })

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (event) => {
    if (trayManager) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  trayManager = new TrayManager()
  trayManager.init(mainWindow!)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  resetStartupLog()

  await registerAppProtocol()

  db = new Database()
  bridgeManager = new BridgeManager()

  const services = registerAllIpcHandlers(db, bridgeManager, () => mainWindow)
  const botPushService = services.botPushService
  processService = services.processService

  registerAppIpcHandlers()

  notificationManager = new NotificationManager(() => mainWindow)
  notificationManager.setBotPushService(botPushService)
  processService!.setNotificationManager(notificationManager)

  await createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !trayManager) {
    app.quit()
  }
})

app.on('before-quit', () => {
  trayManager?.destroy()
  trayManager = null

  processService?.cleanup()
  processService = null

  bridgeManager?.destroyAll()
  db?.close()
})

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
      title: 'Select Directory',
    })
    return result.filePaths[0] || ''
  })

  ipcMain.handle('app:selectFile', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Files',
    })
    return result.filePaths
  })

  ipcMain.handle('app:openInExplorer', async (_event, targetPath: string) => {
    if (targetPath) shell.showItemInFolder(targetPath)
  })

  ipcMain.handle('app:openInTerminal', async (_event, targetPath: string) => {
    if (targetPath) shell.openPath(targetPath)
  })

  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('clipboard:readText', async () => {
    return clipboard.readText()
  })

  ipcMain.handle('tray:updateSessionCount', (_event, count: number) => {
    trayManager?.onSessionStatusChange(count)
  })

  ipcMain.handle('notificationManager:notify', (_event, type: string, sessionId: string, sessionName: string, detail?: string) => {
    notificationManager?.notify(type as never, sessionId, sessionName, detail)
  })
  ipcMain.handle('notificationManager:setDND', (_event, enabled: boolean, startTime?: string, endTime?: string) => {
    notificationManager?.setDND(enabled, startTime, endTime)
  })
  ipcMain.handle('notificationManager:setTypeEnabled', (_event, type: string, enabled: boolean) => {
    notificationManager?.setTypeEnabled(type as never, enabled)
  })
  ipcMain.handle('notificationManager:setSoundEnabled', (_event, enabled: boolean) => {
    notificationManager?.setSoundEnabled(enabled)
  })
  ipcMain.handle('notificationManager:setEnabled', (_event, enabled: boolean) => {
    notificationManager?.setEnabled(enabled)
  })
  ipcMain.handle('notificationManager:getConfig', () => {
    return notificationManager?.getConfig() ?? null
  })
  ipcMain.handle('notificationManager:acknowledge', (_event, sessionId: string, type?: string) => {
    notificationManager?.acknowledge(sessionId, type as never)
  })

  ipcMain.on('native-files-dropped', (event, paths: string[]) => {
    event.sender.send('files-dropped', paths)
  })

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
