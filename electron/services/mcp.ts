/**
 * MCPService - MCP server configuration management.
 * Servers are user-installed only; no built-in catalog is seeded or discovered.
 */

import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import fs from 'node:fs'
import type { Database } from './database.js'
import { resolveProcessCommand } from '../bridge/runtime.js'
import { applyMempalaceSafeProxy } from './mempalace-safe.js'

type McpSummary = {
  serverIdentifier: string
  name: string
  description: string
}

export class MCPService {
  private purgedBuiltins = false

  constructor(private db: Database) {}

  private slugify(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  private parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  /**
   * Remove previously auto-seeded built-in MCP rows. Preserves user-installed custom servers.
   */
  private purgeSeededBuiltins(): void {
    this.db.raw.prepare(`
      DELETE FROM mcp_servers
      WHERE id LIKE 'builtin-%'
    `).run()
    this.purgedBuiltins = true
  }

  private ensureBuiltinsPurged(): void {
    if (this.purgedBuiltins) return
    this.purgeSeededBuiltins()
  }

  private inspectCommand(command: string): { ok: boolean; resolvedCommand: string } {
    const raw = String(command || '').trim() || 'node'

    try {
      const resolved = resolveProcessCommand(raw, raw)
      const pieces = [resolved.command, ...resolved.args].filter(Boolean)
      const resolvedCommand = pieces.join(' ')
      const looksAbsolute = path.isAbsolute(resolved.command) || resolved.command.includes('\\') || resolved.command.includes('/')
      const ok = looksAbsolute
        ? fs.existsSync(resolved.command)
        : ['node', 'npx', 'npm', 'pnpm', 'yarn', 'git', 'python', 'py', 'uv', 'bash', 'cmd'].includes(resolved.command.toLowerCase())
          || resolved.command !== raw

      return { ok, resolvedCommand }
    } catch {
      return { ok: false, resolvedCommand: raw }
    }
  }

  private mergeRow(row: any): any {
    const command = row.command || ''
    const args = this.parseJson(row.args_json, [])
    const env = this.parseJson(row.env_json, {})
    // Built-in catalog removed; any remaining row is treated as custom.
    const source = 'custom'
    const inspect = this.inspectCommand(command)

    return {
      ...row,
      name: row.name || '',
      description: row.description || '',
      command,
      args,
      env,
      isEnabled: !!row.is_enabled,
      enabled: !!row.is_enabled,
      source,
      serverIdentifier: this.slugify(row.name || row.id || ''),
      path: '',
      transport: 'stdio',
      toolCount: 0,
      tools: [],
      hasInstructions: false,
      instructions: '',
      compatibleProviders: 'all',
      tags: [],
      author: '',
      homepage: '',
      installMethod: '',
      installCommand: '',
      category: 'custom',
      removable: true,
      isInstalled: inspect.ok,
      resolvedCommand: inspect.resolvedCommand,
    }
  }

  private getInternal(id: string): any {
    const row = this.db.raw.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as any
    return row ? this.mergeRow(row) : null
  }

  private listInternal(onlyEnabled: boolean): any[] {
    this.ensureBuiltinsPurged()
    const sql = onlyEnabled
      ? 'SELECT * FROM mcp_servers WHERE is_enabled = 1 ORDER BY name'
      : 'SELECT * FROM mcp_servers ORDER BY name'

    return this.db.raw.prepare(sql).all().map((row: any) => this.mergeRow(row))
  }

  list(): any[] {
    return this.listInternal(false)
  }

  get(id: string): any {
    this.ensureBuiltinsPurged()
    return this.getInternal(id)
  }

  install(srv: any): any {
    this.ensureBuiltinsPurged()
    const id = srv.id || uuidv4()
    // Never reintroduce catalog ids via install.
    if (String(id).startsWith('builtin-')) {
      throw new Error('Built-in MCP catalog is disabled; use a custom server id')
    }
    const now = new Date().toISOString()
    this.db.raw.prepare(`
      INSERT INTO mcp_servers (id, name, description, command, args_json, env_json, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = ?, description = ?, command = ?, args_json = ?, env_json = ?, updated_at = ?
    `).run(id, srv.name || '', srv.description || '', srv.command || '',
      JSON.stringify(srv.args || []), JSON.stringify(srv.env || {}), now, now,
      srv.name || '', srv.description || '', srv.command || '',
      JSON.stringify(srv.args || []), JSON.stringify(srv.env || {}), now)
    return this.getInternal(id)
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
    const server = this.get(id)
    if (!server) return null

    const commandCheck = this.inspectCommand(server.command)
    const checks = [
      {
        name: '命令解析',
        ok: commandCheck.ok,
        message: commandCheck.ok
          ? `已解析为 ${commandCheck.resolvedCommand}`
          : `未能确认命令可执行：${server.command || '(empty)'}`,
      },
    ]

    for (const arg of server.args || []) {
      if (typeof arg !== 'string') continue
      if (!path.isAbsolute(arg)) continue
      checks.push({
        name: '本地依赖',
        ok: fs.existsSync(arg),
        message: fs.existsSync(arg)
          ? `已找到 ${arg}`
          : `缺少 ${arg}`,
      })
    }

    return {
      id,
      instructions: server.instructions || '',
      ready: checks.every(check => check.ok),
      resolvedCommand: [commandCheck.resolvedCommand, ...(server.args || [])].filter(Boolean).join(' '),
      checks,
    }
  }

  /**
   * Startup hook (name retained for API compatibility).
   * Purges any previously seeded built-in MCP rows; does not reinstall any catalog.
   */
  seedBuiltins(): void {
    this.purgeSeededBuiltins()
  }

  getEnabledServerConfigs(): Record<string, { command: string; args: string[]; env: Record<string, string>; cwd?: string }> {
    const configs: Record<string, { command: string; args: string[]; env: Record<string, string>; cwd?: string }> = {}

    for (const server of this.listInternal(true)) {
      const key = server.serverIdentifier || this.slugify(server.name || server.id || '')
      if (!key) continue

      configs[key] = {
        command: server.command || 'node',
        args: Array.isArray(server.args) ? server.args : [],
        env: server.env && typeof server.env === 'object' ? server.env : {},
      }
    }

    // MemPalace: multi-agent sessions each spawn an MCP process; the palace
    // exclusive writer lease causes "peer lock / 未写入". Transparent safe
    // proxy serializes writes + allows peer writer with host-side file lock.
    return applyMempalaceSafeProxy(configs)
  }

  getEnabledServerSummaries(limit = 24): McpSummary[] {
    return this.listInternal(true)
      .map(server => ({
        serverIdentifier: server.serverIdentifier,
        name: server.name,
        description: server.description,
      }))
      .slice(0, limit)
  }

  getAll(): any[] { return this.list() }
  create(data: any): any { return this.install(data) }
  update(id: string, data: any): void {
    const now = new Date().toISOString()
    this.db.raw.prepare('UPDATE mcp_servers SET name = ?, description = ?, command = ?, args_json = ?, env_json = ?, is_enabled = ?, updated_at = ? WHERE id = ?')
      .run(data.name || '', data.description || '', data.command || '', JSON.stringify(data.args || []), JSON.stringify(data.env || []), data.isEnabled ? 1 : 0, now, id)
  }
  delete(id: string): void { this.uninstall(id) }
}
