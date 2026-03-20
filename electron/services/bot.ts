/**
 * BotService - Unified IM bot configuration management
 * Replaces Go internal/services/bot.go
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

interface Bot {
  id: string
  name: string
  type: string
  config: Record<string, any>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export class BotService {
  constructor(private db: Database) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '',
        config_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  private rowToBot(row: any): any {
    const config = JSON.parse(row.config_json || '{}')
    // Spread config so that credentials / agent_profile_id stored inside it
    // are returned at the top level (frontend normalizeBot reads raw.credentials)
    return {
      ...config,
      id: row.id,
      name: row.name,
      type: row.type,
      config,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  list(): any[] {
    return (this.db.raw.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as any[]).map(r => this.rowToBot(r))
  }

  create(bot: any): any {
    const id = uuidv4()
    const now = new Date().toISOString()
    // Support both Bot-style (bot.config) and IMBot-style (bot.credentials / bot.agent_profile_id)
    const config = bot.config ?? {
      credentials: bot.credentials ?? {},
      agent_profile_id: bot.agent_profile_id ?? 'default',
    }
    this.db.raw.prepare(`
      INSERT INTO bots (id, name, type, config_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, bot.name || '', bot.type || '', JSON.stringify(config), bot.enabled ? 1 : 0, now, now)
    return this.rowToBot(this.db.raw.prepare('SELECT * FROM bots WHERE id = ?').get(id))
  }

  update(botId: string, bot: any): void {
    const now = new Date().toISOString()
    const existing = this.db.raw.prepare('SELECT config_json FROM bots WHERE id = ?').get(botId) as any
    const existingConfig = JSON.parse(existing?.config_json || '{}')
    // Merge: prefer explicit bot.config; otherwise build from IMBot credentials fields
    const newConfig = bot.config
      ? { ...existingConfig, ...bot.config }
      : {
          ...existingConfig,
          credentials: bot.credentials ?? existingConfig.credentials ?? {},
          agent_profile_id: bot.agent_profile_id ?? existingConfig.agent_profile_id ?? 'default',
        }
    this.db.raw.prepare(`
      UPDATE bots SET name = COALESCE(?, name), type = COALESCE(?, type),
        config_json = ?, enabled = COALESCE(?, enabled), updated_at = ?
      WHERE id = ?
    `).run(
      bot.name ?? null, bot.type ?? null,
      JSON.stringify(newConfig),
      bot.enabled !== undefined ? (bot.enabled ? 1 : 0) : null,
      now, botId,
    )
  }

  delete(botId: string): void {
    this.db.raw.prepare('DELETE FROM bots WHERE id = ?').run(botId)
  }

  toggle(botId: string, enabled: boolean): void {
    this.db.raw.prepare('UPDATE bots SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), botId)
  }
}
