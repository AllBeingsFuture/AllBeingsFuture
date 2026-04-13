/**
 * TrayManager - System tray icon, context menu, and badge management
 */

import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * System tray manager.
 * Handles tray icon, context menu, badge count, and window toggling.
 */
export class TrayManager {
  /** Tray instance */
  private tray: Tray | null = null

  /** Badge count (active/waiting sessions) */
  private badgeCount: number = 0

  /** Active sessions count (shown as read-only label in menu) */
  private activeSessions: number = 0

  /** Main window reference */
  private mainWindow: BrowserWindow | null = null

  /**
   * Reveal the main window: restore if minimized, show if hidden, then focus.
   */
  private revealMainWindow(): void {
    if (!this.mainWindow) return
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore()
    }
    if (!this.mainWindow.isVisible()) {
      this.mainWindow.show()
    }
    this.mainWindow.focus()
  }

  /**
   * Initialize the tray icon and context menu.
   * @param mainWindow Main BrowserWindow instance
   */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow

    const isDev = !app.isPackaged

    // Resolve icon path — prefer .ico on Windows, .png elsewhere
    let iconPath: string
    if (process.platform === 'win32') {
      iconPath = isDev
        ? path.join(app.getAppPath(), 'appicon.ico')
        : path.join(process.resourcesPath, 'appicon.ico')
    } else if (process.platform === 'darwin') {
      iconPath = isDev
        ? path.join(app.getAppPath(), 'appicon.png')
        : path.join(process.resourcesPath, 'appicon.png')
    } else {
      iconPath = isDev
        ? path.join(app.getAppPath(), 'appicon.png')
        : path.join(process.resourcesPath, 'appicon.png')
    }

    let icon: Electron.NativeImage
    if (existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath)
      icon = icon.resize({ width: 16, height: 16 })
      if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
      }
    } else {
      // Fallback: create a simple blue 16x16 icon
      icon = this.createDefaultIcon()
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('AllBeingsFuture')

    // Build initial context menu
    this.rebuildContextMenu()

    // Click tray icon → toggle window visibility
    this.tray.on('click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide()
        } else {
          this.revealMainWindow()
        }
      }
    })
  }

  /**
   * Create a default fallback icon (solid blue 16x16).
   */
  private createDefaultIcon(): Electron.NativeImage {
    const size = 16
    const buffer = Buffer.alloc(size * size * 4)

    for (let i = 0; i < size * size; i++) {
      buffer[i * 4] = 0x58     // R
      buffer[i * 4 + 1] = 0xA6 // G
      buffer[i * 4 + 2] = 0xFF // B
      buffer[i * 4 + 3] = 0xFF // A
    }

    return nativeImage.createFromBuffer(buffer, { width: size, height: size })
  }

  /**
   * Rebuild the context menu (call after state changes).
   */
  private rebuildContextMenu(): void {
    if (!this.tray) return

    const isVisible = this.mainWindow?.isVisible() ?? false

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? '隐藏窗口' : '显示窗口',
        click: () => {
          if (!this.mainWindow) return
          if (this.mainWindow.isVisible()) {
            this.mainWindow.hide()
          } else {
            this.revealMainWindow()
          }
        },
      },
      {
        label: '新建会话',
        click: () => {
          if (this.mainWindow) {
            this.revealMainWindow()
            this.mainWindow.webContents.send('tray:new-session')
          }
        },
      },
      { type: 'separator' },
      {
        label: `活跃会话数: ${this.activeSessions}`,
        enabled: false, // read-only label
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
  }

  /**
   * Called when session status changes.
   * Updates the badge and context menu with active session count.
   * @param activeSessions Number of currently active/running sessions
   */
  onSessionStatusChange(activeSessions: number): void {
    this.activeSessions = activeSessions
    this.updateBadge(activeSessions)
    this.rebuildContextMenu()
  }

  /**
   * Update tray icon tooltip and overlay badge with count.
   * @param count Number to display as badge
   */
  updateBadge(count: number): void {
    this.badgeCount = count

    if (!this.mainWindow) return

    // Windows: overlay icon on taskbar
    if (process.platform === 'win32') {
      if (this.badgeCount > 0) {
        const badgeImage = this.createBadgeIcon()
        this.mainWindow.setOverlayIcon(badgeImage, `${this.badgeCount} 个活跃会话`)
      } else {
        this.mainWindow.setOverlayIcon(null, '')
      }
    }

    // macOS: dock badge
    if (process.platform === 'darwin') {
      app.dock?.setBadge(this.badgeCount > 0 ? this.badgeCount.toString() : '')
    }

    // Update tooltip
    if (this.tray) {
      this.tray.setToolTip(
        this.badgeCount > 0
          ? `AllBeingsFuture - ${this.badgeCount} 个活跃会话`
          : 'AllBeingsFuture',
      )
    }
  }

  /**
   * Create a red circle badge icon for the overlay.
   */
  private createBadgeIcon(): Electron.NativeImage {
    const size = 16
    const buffer = Buffer.alloc(size * size * 4)
    const center = size / 2
    const radius = size / 2

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2)
        const idx = (y * size + x) * 4

        if (dist <= radius) {
          buffer[idx] = 0xF8     // R (red)
          buffer[idx + 1] = 0x51 // G
          buffer[idx + 2] = 0x49 // B
          buffer[idx + 3] = 0xFF // A
        } else {
          buffer[idx + 3] = 0x00 // transparent
        }
      }
    }

    return nativeImage.createFromBuffer(buffer, { width: size, height: size })
  }

  /**
   * Destroy the tray icon. Call on app quit.
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
