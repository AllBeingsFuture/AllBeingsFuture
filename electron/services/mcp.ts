/**
 * MCPService - MCP server configuration management
 * Replaces Go internal/services/mcp.go
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export class MCPService {
  constructor(private db: Database) {}

  private rowToMcp(row: any): any {
    return {
      ...row,
      isEnabled: !!row.is_enabled,
      args: JSON.parse(row.args_json || '[]'),
      env: JSON.parse(row.env_json || '{}'),
    }
  }

  list(): any[] {
    return this.db.raw.prepare('SELECT * FROM mcp_servers ORDER BY name').all().map((r: any) => this.rowToMcp(r))
  }

  get(id: string): any {
    const row = this.db.raw.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as any
    return row ? this.rowToMcp(row) : null
  }

  install(srv: any): any {
    const id = srv.id || uuidv4()
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO mcp_servers (id, name, description, command, args_json, env_json, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = ?, description = ?, command = ?, args_json = ?, env_json = ?, updated_at = ?
    `).run(id, srv.name || '', srv.description || '', srv.command || '',
      JSON.stringify(srv.args || []), JSON.stringify(srv.env || {}), now, now,
      srv.name || '', srv.description || '', srv.command || '',
      JSON.stringify(srv.args || []), JSON.stringify(srv.env || {}), now)
    return this.get(id)
  }

  uninstall(id: string): void {
    this.db.raw.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  }

  updateConfig(id: string, config: any): void {
    const now = new Date().toISOString()
    if (config.command !== undefined) {
      this.db.raw.prepare('UPDATE mcp_servers SET command = ?, updated_at = ? WHERE id = ?').run(config.command, now, id)
    }
    if (config.args !== undefined) {
      this.db.raw.prepare('UPDATE mcp_servers SET args_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(config.args), now, id)
    }
    if (config.env !== undefined) {
      this.db.raw.prepare('UPDATE mcp_servers SET env_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(config.env), now, id)
    }
  }

  toggleEnabled(id: string, enabled: boolean): void {
    this.db.raw.prepare('UPDATE mcp_servers SET is_enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), id)
  }

  getRuntimeInfo(id: string): any {
    const srv = this.get(id)
    if (!srv) return null
    return { id, name: srv.name, command: srv.command, isEnabled: srv.isEnabled, status: 'unknown' }
  }

  seedBuiltins(): void {
    // Can seed default MCP servers here
  }

  // Legacy methods
  getAll(): any[] { return this.list() }
  create(data: any): any { return this.install(data) }
  update(id: string, data: any): void {
    const now = new Date().toISOString()
    this.db.raw.prepare('UPDATE mcp_servers SET name = ?, description = ?, command = ?, args_json = ?, env_json = ?, is_enabled = ?, updated_at = ? WHERE id = ?')
      .run(data.name || '', data.description || '', data.command || '', JSON.stringify(data.args || []), JSON.stringify(data.env || {}), data.isEnabled ? 1 : 0, now, id)
  }
  delete(id: string): void { this.uninstall(id) }
}
