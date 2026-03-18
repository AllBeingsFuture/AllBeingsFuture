/**
 * SystemSettingsService - Structured system configuration
 * Replaces Go internal/services/system_settings.go
 */

import type { Database } from './database.js'

export interface SystemConfig {
  auth: { enabled: boolean; provider: string }
  logging: { level: string; maxFiles: number; maxSizeMB: number }
  telemetry: { enabled: boolean }
  workflow: { maxConcurrent: number; defaultTimeout: number }
  storage: { dbPath: string; maxSizeMB: number }
  provider: { defaultId: string; timeout: number }
  mcp: { enabled: boolean; maxServers: number }
  skill: { enabled: boolean; autoSync: boolean }
  notification: { enabled: boolean; sound: boolean }
  telegram: { enabled: boolean }
  update: { autoCheck: boolean; channel: string }
}

const DEFAULT_CONFIG: SystemConfig = {
  auth: { enabled: false, provider: 'local' },
  logging: { level: 'info', maxFiles: 10, maxSizeMB: 50 },
  telemetry: { enabled: false },
  workflow: { maxConcurrent: 5, defaultTimeout: 3600 },
  storage: { dbPath: '', maxSizeMB: 500 },
  provider: { defaultId: 'claude-code', timeout: 300 },
  mcp: { enabled: true, maxServers: 20 },
  skill: { enabled: true, autoSync: true },
  notification: { enabled: true, sound: true },
  telegram: { enabled: false },
  update: { autoCheck: true, channel: 'stable' },
}

export class SystemSettingsService {
  constructor(private db: Database) {}

  getConfig(): SystemConfig {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'system_config'").get() as any
      if (row?.value) {
        const config = { ...DEFAULT_CONFIG, ...JSON.parse(row.value) }
        if (config.provider?.defaultId === 'builtin-claude') {
          config.provider.defaultId = 'claude-code'
        } else if (config.provider?.defaultId === 'builtin-codex') {
          config.provider.defaultId = 'codex'
        }
        return config
      }
    } catch {}
    return { ...DEFAULT_CONFIG }
  }

  getAll(): Record<string, string> {
    const rows = this.db.raw.prepare('SELECT key, value FROM settings').all() as any[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  get(key: string): string {
    const row = this.db.raw.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row?.value || ''
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
    const batch = this.db.raw.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        stmt.run(key, value, value)
      }
    })
    batch(Object.entries(settings))
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const config = this.getConfig()
    const errors: string[] = []

    if (config.workflow.maxConcurrent < 1) errors.push('workflow.maxConcurrent must be >= 1')
    if (config.workflow.defaultTimeout < 1) errors.push('workflow.defaultTimeout must be >= 1')
    if (config.mcp.maxServers < 0) errors.push('mcp.maxServers must be >= 0')

    return { valid: errors.length === 0, errors }
  }
}
