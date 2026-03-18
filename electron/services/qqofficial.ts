/**
 * QQOfficialService - QQ Official Bot management
 * Replaces Go internal/services/qqofficial.go
 */

import type { Database } from './database.js'

interface QQOfficialConfig {
  [key: string]: any
}

export class QQOfficialService {
  private running = false
  private config: QQOfficialConfig = {}

  constructor(private db: Database) {
    this.loadConfig()
  }

  private loadConfig(): void {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'qqofficial_config'").get() as any
      if (row?.value) this.config = JSON.parse(row.value)
    } catch {}
  }

  private saveConfig(): void {
    const json = JSON.stringify(this.config)
    this.db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run('qqofficial_config', json, json)
  }

  start(): void { this.running = true }
  stop(): void { this.running = false }
  reload(): void { this.loadConfig() }
  restart(): void { this.stop(); this.loadConfig(); this.start() }

  status(): { running: boolean } { return { running: this.running } }

  getConfig(): QQOfficialConfig { return { ...this.config } }

  updateConfig(key: string, value: any): void {
    this.config[key] = value
    this.saveConfig()
  }
}
