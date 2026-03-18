/**
 * NotificationManager - Enhanced system notification management
 * Ported from SpectrAI NotificationManager, adapted for AllBeingsFuture.
 *
 * Features:
 * - Typed notifications (confirmation, taskComplete, error, stuck)
 * - DND (Do Not Disturb) scheduling
 * - Per-type enable/disable
 * - Sound toggle
 * - Duplicate prevention (30-second cooldown per session+type)
 * - Click notification → focus window + select session
 */

import { EventEmitter } from 'events'
import { Notification, BrowserWindow } from 'electron'

/** Notification types */
export type NotificationType = 'confirmation' | 'taskComplete' | 'error' | 'stuck'

/**
 * Internal record for deduplication with cooldown.
 */
interface RecentEntry {
  timestamp: number
}

/**
 * Notification manager with DND, per-type toggles, sound control,
 * and 30-second duplicate prevention.
 */
export class NotificationManager extends EventEmitter {
  /** Global enabled flag */
  private enabled: boolean = true

  /** Sound enabled flag */
  private soundEnabled: boolean = true

  /** DND config */
  private dnd = {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  }

  /** Per-type enabled flags */
  private typeEnabled: Record<NotificationType, boolean> = {
    confirmation: true,
    taskComplete: true,
    error: true,
    stuck: true,
  }

  /**
   * Duplicate prevention map.
   * Key: `${sessionId}:${type}` → last sent timestamp.
   * Prevents re-sending the same notification within 30 seconds.
   */
  private recentNotifications: Map<string, RecentEntry> = new Map()

  /** Cooldown period in milliseconds */
  private static readonly COOLDOWN_MS = 30_000

  /** Window accessor */
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    super()
    this.getWindow = getWindow
  }

  // ------------------------------------------------------------------
  // Configuration API
  // ------------------------------------------------------------------

  /**
   * Set Do Not Disturb schedule.
   * @param enabled Whether DND is active
   * @param startTime Start time in "HH:MM" format (e.g. "22:00")
   * @param endTime End time in "HH:MM" format (e.g. "08:00")
   */
  setDND(enabled: boolean, startTime?: string, endTime?: string): void {
    this.dnd.enabled = enabled
    if (startTime !== undefined) this.dnd.startTime = startTime
    if (endTime !== undefined) this.dnd.endTime = endTime
  }

  /**
   * Enable or disable a specific notification type.
   */
  setTypeEnabled(type: NotificationType, enabled: boolean): void {
    this.typeEnabled[type] = enabled
  }

  /**
   * Enable or disable notification sound.
   */
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled
  }

  /**
   * Enable or disable all notifications globally.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Get current configuration snapshot (useful for IPC).
   */
  getConfig() {
    return {
      enabled: this.enabled,
      sound: this.soundEnabled,
      dnd: { ...this.dnd },
      types: { ...this.typeEnabled },
    }
  }

  // ------------------------------------------------------------------
  // Core notification method
  // ------------------------------------------------------------------

  /**
   * Send a system notification.
   * Respects DND, per-type toggles, and 30-second dedup window.
   *
   * @param type Notification type
   * @param sessionId Session ID (for dedup and click-to-focus)
   * @param sessionName Human-readable session name
   * @param detail Optional extra detail text
   */
  notify(
    type: NotificationType,
    sessionId: string,
    sessionName: string,
    detail?: string,
  ): void {
    // Global check
    if (!this.enabled) return

    // Per-type check
    if (!this.typeEnabled[type]) return

    // DND check
    if (this.isDNDActive()) return

    // Duplicate check (30-second cooldown)
    const dedupKey = `${sessionId}:${type}`
    const recent = this.recentNotifications.get(dedupKey)
    const now = Date.now()
    if (recent && now - recent.timestamp < NotificationManager.COOLDOWN_MS) {
      return
    }

    // Record this send
    this.recentNotifications.set(dedupKey, { timestamp: now })

    // Build title + body based on type
    const { title, body } = this.buildContent(type, sessionName, detail)

    // Send system notification
    this.sendSystemNotification(title, body, sessionId)

    // Emit event for other listeners (e.g. badge update)
    this.emit('notification-sent', { type, sessionId, sessionName, detail })
  }

  // ------------------------------------------------------------------
  // Convenience methods (match existing NotificationService API)
  // ------------------------------------------------------------------

  onConfirmationNeeded(sessionId: string, sessionName: string): void {
    this.notify('confirmation', sessionId, sessionName)
  }

  onTaskCompleted(sessionId: string, sessionName: string): void {
    this.notify('taskComplete', sessionId, sessionName)
  }

  onError(sessionId: string, sessionName: string, errorMsg: string): void {
    this.notify('error', sessionId, sessionName, errorMsg)
  }

  onSessionStuck(sessionId: string, sessionName: string): void {
    this.notify('stuck', sessionId, sessionName)
  }

  /**
   * Acknowledge / dismiss a notification for a session+type.
   * Removes the dedup entry so a new notification can be sent immediately.
   */
  acknowledge(sessionId: string, type?: NotificationType): void {
    if (type) {
      this.recentNotifications.delete(`${sessionId}:${type}`)
    } else {
      // Clear all types for this session
      for (const t of ['confirmation', 'taskComplete', 'error', 'stuck'] as NotificationType[]) {
        this.recentNotifications.delete(`${sessionId}:${t}`)
      }
    }
  }

  /**
   * Clear all tracked notifications for a session (e.g. when session ends).
   */
  clearSession(sessionId: string): void {
    this.acknowledge(sessionId)
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Check whether the current time falls within the DND window.
   */
  private isDNDActive(): boolean {
    if (!this.dnd.enabled) return false

    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const current = h * 60 + m

    const [sh, sm] = this.dnd.startTime.split(':').map(Number)
    const [eh, em] = this.dnd.endTime.split(':').map(Number)
    const start = sh * 60 + sm
    const end = eh * 60 + em

    if (start <= end) {
      // Same-day range, e.g. 09:00 – 17:00
      return current >= start && current < end
    }
    // Overnight range, e.g. 22:00 – 08:00
    return current >= start || current < end
  }

  /**
   * Build notification title and body from type + session info.
   */
  private buildContent(
    type: NotificationType,
    sessionName: string,
    detail?: string,
  ): { title: string; body: string } {
    switch (type) {
      case 'confirmation':
        return {
          title: '需要确认',
          body: `会话 "${sessionName}" 正在等待您的确认`,
        }
      case 'taskComplete':
        return {
          title: '任务已完成',
          body: `会话 "${sessionName}" 已完成任务`,
        }
      case 'error':
        return {
          title: '遇到错误',
          body: detail
            ? `会话 "${sessionName}": ${detail}`
            : `会话 "${sessionName}" 发生错误`,
        }
      case 'stuck':
        return {
          title: '会话可能卡住',
          body: `会话 "${sessionName}" 长时间无响应，可能需要干预`,
        }
    }
  }

  /**
   * Send an Electron system notification.
   * Clicking the notification focuses the window and tells the renderer
   * to select the session.
   */
  private sendSystemNotification(title: string, body: string, sessionId: string): void {
    if (!Notification.isSupported()) return

    try {
      const notification = new Notification({
        title,
        body,
        silent: !this.soundEnabled,
      })

      notification.on('click', () => {
        const win = this.getWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          if (!win.isVisible()) win.show()
          win.focus()
          win.webContents.send('notification:select-session', { sessionId })
        }
      })

      notification.show()
    } catch (error) {
      console.error('[NotificationManager] Failed to send notification:', error)
    }
  }
}
