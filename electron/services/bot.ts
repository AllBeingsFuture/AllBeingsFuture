/**
 * BotService - Unified IM bot configuration management
 * Replaces Go internal/services/bot.go
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

interface Bot {
  id: string
  name: string
  type: 'telegram' | 'qq' | 'qqofficial'
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

  private rowToBot(row: any): Bot {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config_json || '{}'),
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  list(): Bot[] {
    return (this.db.raw.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as any[]).map(r => this.rowToBot(r))
  }

  create(bot: Partial<Bot>): Bot {
    const id = uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO bots (id, name, type, config_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, bot.name || '', bot.type || '', JSON.stringify(bot.config || {}), bot.enabled ? 1 : 0, now, now)
    return this.rowToBot(this.db.raw.prepare('SELECT * FROM bots WHERE id = ?').get(id))
  }

  update(botId: string, bot: Partial<Bot>): void {
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      UPDATE bots SET name = COALESCE(?, name), type = COALESCE(?, type),
        config_json = COALESCE(?, config_json), enabled = COALESCE(?, enabled), updated_at = ?
      WHERE id = ?
    `).run(
      bot.name ?? null, bot.type ?? null,
      bot.config ? JSON.stringify(bot.config) : null,
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
