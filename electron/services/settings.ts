/**
 * SettingsService - manages application settings
 * Replaces Go internal/services/settings.go
 */

import { app } from 'electron'
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
      autoWorktree: settings.autoWorktree ?? false,
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

  getAutoWorktree(): boolean {
    const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'autoWorktree'").get() as any
    return row?.value === 'true'
  }

  setAutoWorktree(enabled: boolean): void {
    this.update('autoWorktree', String(enabled))
  }

  setAutoLaunch(enabled: boolean): void {
    this.update('autoLaunch', String(enabled))
    app.setLoginItemSettings({ openAtLogin: enabled })
  }

  getAutoLaunch(): boolean {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
  }

  getProxyEnv(): [string, string] {
    const settings = this.getAll()
    if (settings.proxyType === 'none' || !settings.proxyHost) {
      return ['', '']
    }
    const auth = settings.proxyUsername
      ? `${settings.proxyUsername}:${settings.proxyPassword}@`
      : ''
    const url = `${settings.proxyType}://${auth}${settings.proxyHost}:${settings.proxyPort}`
    return [url, url]
  }

  sendNotification(title: string, body: string): void {
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  }
}
