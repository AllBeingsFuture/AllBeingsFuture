/**
 * SettingsService - manages application settings
 * Replaces Go internal/services/settings.go
 *
 * Note: General / theme / workspace manager UI settings were removed from the
 * settings surface. Runtime still exposes getAll defaults (theme, fontSize,
 * legacy rows) for remaining consumers. Child-agent worktree isolation is
 * always on: getAutoWorktree() hardcodes true (user write path removed).
 */

import type { Database } from './database.js'

export interface AppSettings {
  theme: string
  fontSize: number
  autoWorktree: boolean
  alwaysReplyInChinese: boolean
  autoLaunch: boolean
  notificationEnabled: boolean
  proxyType: string
  proxyHost: string
  proxyPort: string
  proxyUsername: string
  proxyPassword: string
  voiceTranscriptionMode: string
  voiceTranscriptionProviderId: string
  [key: string]: any
}

export class SettingsService {
  constructor(private db: Database) {}

  getAll(): AppSettings {
    const rows = this.db.raw.prepare('SELECT key, value FROM settings').all() as Array<{key: string, value: string}>
    const settings: Record<string, any> = {}

    for (const row of rows) {
      // Convert known boolean fields
      if (['autoWorktree', 'alwaysReplyInChinese', 'autoLaunch', 'notificationEnabled'].includes(row.key)) {
        settings[row.key] = row.value === 'true'
      } else if (row.key === 'fontSize') {
        settings[row.key] = parseInt(row.value, 10) || 14
      } else {
        settings[row.key] = row.value
      }
    }

    return {
      theme: settings.theme || 'dark',
      fontSize: settings.fontSize || 14,
      alwaysReplyInChinese: settings.alwaysReplyInChinese ?? true,
      autoLaunch: settings.autoLaunch ?? false,
      notificationEnabled: settings.notificationEnabled ?? true,
      proxyType: settings.proxyType || 'none',
      proxyHost: settings.proxyHost || '',
      proxyPort: settings.proxyPort || '',
      proxyUsername: settings.proxyUsername || '',
      proxyPassword: settings.proxyPassword || '',
      voiceTranscriptionMode: settings.voiceTranscriptionMode || 'openai',
      voiceTranscriptionProviderId: settings.voiceTranscriptionProviderId || '',
      ...settings,
      // Always on for child isolation; UI toggle removed (force after spread)
      autoWorktree: true,
    }
  }

  update(key: string, value: string): void {
    this.db.raw.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value)
  }

  updateBatch(settings: Record<string, string>): void {
    const stmt = this.db.raw.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    )

    const tx = this.db.raw.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, value, value)
      }
    })
    tx()
  }

  /**
   * Child agent worktree isolation is always enabled.
   * User-facing SetAutoWorktree was removed with General settings UI.
   */
  getAutoWorktree(): boolean {
    return true
  }

  sendNotification(title: string, body: string): void {
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  }
}
