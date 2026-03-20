/**
 * NotificationService - System notification management
 * Replaces Go internal/services/notification.go
 */

import { Notification, BrowserWindow } from 'electron'

interface NotificationConfig {
  enabled: boolean
  sound: boolean
  dndEnabled: boolean
  dndStart: string
  dndEnd: string
  types: Record<string, boolean>
}

interface PendingNotification {
  sessionId: string
  type: string
  timestamp: string
}

export class NotificationService {
  private config: NotificationConfig = {
    enabled: true,
    sound: true,
    dndEnabled: false,
    dndStart: '22:00',
    dndEnd: '08:00',
    types: {
      confirmation: true,
      taskCompleted: true,
      error: true,
      stuck: true,
    },
  }

  private pending = new Map<string, PendingNotification>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  updateConfig(
    enabled: boolean,
    sound: boolean,
    dndEnabled: boolean,
    dndStart: string,
    dndEnd: string,
    types: Record<string, boolean>,
  ): void {
    this.config = { enabled, sound, dndEnabled, dndStart, dndEnd, types }
  }

  private isDnd(): boolean {
    if (!this.config.dndEnabled) return false
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const current = h * 60 + m

    const [sh, sm] = this.config.dndStart.split(':').map(Number)
    const [eh, em] = this.config.dndEnd.split(':').map(Number)
    const start = sh * 60 + sm
    const end = eh * 60 + em

    if (start <= end) {
      return current >= start && current < end
    }
    return current >= start || current < end
  }

  private shouldNotify(type: string): boolean {
    if (!this.config.enabled) return false
    if (this.isDnd()) return false
    if (this.config.types[type] === false) return false
    return true
  }

  private sendSystemNotification(title: string, body: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: !this.config.sound })
    n.show()
  }

  private emitToRenderer(event: string, data: any): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(event, data)
    }
  }

  onConfirmationNeeded(sessionId: string, sessionName: string): void {
    if (!this.shouldNotify('confirmation')) return

    const key = `confirmation:${sessionId}`
    if (this.pending.has(key)) return

    this.pending.set(key, { sessionId, type: 'confirmation', timestamp: new Date().toISOString() })
    this.sendSystemNotification('需要确认', `会话 "${sessionName}" 需要你的确认`)
    this.emitToRenderer('notification:confirmation', { sessionId, sessionName })
  }

  onTaskCompleted(sessionId: string, sessionName: string): void {
    if (!this.shouldNotify('taskCompleted')) return
    this.sendSystemNotification('任务完成', `会话 "${sessionName}" 已完成`)
    this.emitToRenderer('notification:taskCompleted', { sessionId, sessionName })
  }

  onError(sessionId: string, sessionName: string, errorMsg: string): void {
    if (!this.shouldNotify('error')) return
    this.sendSystemNotification('错误', `会话 "${sessionName}": ${errorMsg}`)
    this.emitToRenderer('notification:error', { sessionId, sessionName, error: errorMsg })
  }

  onSessionStuck(sessionId: string, sessionName: string): void {
    if (!this.shouldNotify('stuck')) return
    this.sendSystemNotification('会话卡住', `会话 "${sessionName}" 似乎卡住了`)
    this.emitToRenderer('notification:stuck', { sessionId, sessionName })
  }

  acknowledge(sessionId: string, ntype: string): void {
    const key = `${ntype}:${sessionId}`
    this.pending.delete(key)
  }
}
