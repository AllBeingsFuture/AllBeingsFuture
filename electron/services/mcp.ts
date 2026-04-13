/**
 * MCPService - MCP server configuration management
 * Replaces Go internal/services/mcp.go
 * Full API matching frontend bindings
 */

import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { Database } from './database.js'
import { resolveProcessCommand } from '../bridge/runtime.js'

type DiscoveredServer = {
  id: string
  serverIdentifier: string
  name: string
  description: string
  command: string
  args: string[]
  env: Record<string, string>
  source: 'builtin'
  path: string
  transport: 'stdio'
  toolCount: number
  hasInstructions: boolean
  instructions: string
  tools: string[]
  compatibleProviders: string[] | 'all'
  tags: string[]
  author: string
  homepage: string
  installMethod?: string
  installCommand?: string
  category: string
}

type McpSummary = Pick<DiscoveredServer, 'serverIdentifier' | 'name' | 'description'>

export class MCPService {
  constructor(private db: Database) {}

  private getMcpsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'mcps')
      : path.join(app.getAppPath(), 'electron', 'embedded-assets', 'mcps')
  }

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

  private resolveArgs(serverDir: string, args: unknown): string[] {
    if (!Array.isArray(args)) return []

    return args.map((value) => {
      if (typeof value !== 'string') return String(value ?? '')
      if (!value || value.startsWith('-') || value.startsWith('/') || value.includes(':')) {
        return value
      }
      const candidate = path.join(serverDir, value)
      return fs.existsSync(candidate) ? candidate : value
    })
  }

  private readJsonFile(filePath: string): Record<string, any> | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  private readTextFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  }

  private discoverBuiltins(): Map<string, DiscoveredServer> {
    const mcpsDir = this.getMcpsDir()
    const discovered = new Map<string, DiscoveredServer>()

    if (!fs.existsSync(mcpsDir)) return discovered

    const entries = fs.readdirSync(mcpsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const serverDir = path.join(mcpsDir, entry.name)
      const metadataPath = path.join(serverDir, 'SERVER_METADATA.json')
      const metadata = this.readJsonFile(metadataPath)
      if (!metadata) continue

      const serverIdentifier = String(metadata.serverIdentifier || entry.name).trim()
      if (!serverIdentifier) continue

      const toolsDir = path.join(serverDir, 'tools')
      const tools = fs.existsSync(toolsDir)
        ? fs.readdirSync(toolsDir, { withFileTypes: true })
          .filter(file => file.isFile() && file.name.endsWith('.json'))
          .map(file => file.name.replace(/\.json$/i, ''))
          .sort((left, right) => left.localeCompare(right))
        : []
      const instructionsPath = path.join(serverDir, 'INSTRUCTIONS.md')

      discovered.set(`builtin-${serverIdentifier}`, {
        id: `builtin-${serverIdentifier}`,
        serverIdentifier,
        name: String(metadata.serverName || entry.name).trim(),
        description: String(metadata.serverDescription || '').trim(),
        command: String(metadata.command || 'node').trim(),
        args: this.resolveArgs(serverDir, metadata.args),
        env: metadata.env && typeof metadata.env === 'object'
          ? Object.fromEntries(Object.entries(metadata.env).map(([key, value]) => [key, String(value)]))
          : {},
        source: 'builtin',
        path: serverDir,
        transport: 'stdio',
        toolCount: tools.length,
        hasInstructions: fs.existsSync(instructionsPath),
        instructions: this.readTextFile(instructionsPath),
        tools,
        compatibleProviders: Array.isArray(metadata.compatibleProviders) ? metadata.compatibleProviders : 'all',
        tags: Array.isArray(metadata.tags) ? metadata.tags.map((tag: unknown) => String(tag)) : [],
        author: String(metadata.author || '').trim(),
        homepage: String(metadata.homepage || '').trim(),
        installMethod: metadata.installMethod ? String(metadata.installMethod) : undefined,
        installCommand: metadata.installCommand ? String(metadata.installCommand) : undefined,
        category: String(metadata.category || entry.name || 'custom').trim(),
      })
    }

    return discovered
  }

  private pruneMissingBuiltins(validIds: Set<string>): void {
    const rows = this.db.raw
      .prepare("SELECT id FROM mcp_servers WHERE id LIKE 'builtin-%'")
      .all() as Array<{ id: string }>

    for (const row of rows) {
      if (validIds.has(row.id)) continue
      this.db.raw.prepare("DELETE FROM mcp_servers WHERE id = ?").run(row.id)
    }
  }

  private syncBuiltinsInternal(): Map<string, DiscoveredServer> {
    const discovered = this.discoverBuiltins()

    for (const server of discovered.values()) {
      this.install({
        id: server.id,
        name: server.name,
        description: server.description,
        command: server.command,
        args: server.args,
        env: server.env,
      })
    }

    this.pruneMissingBuiltins(new Set(discovered.keys()))
    return discovered
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

  private mergeRow(row: any, discovered?: DiscoveredServer): any {
    const command = row.command || discovered?.command || ''
    const args = this.parseJson(row.args_json, discovered?.args || [])
    const env = this.parseJson(row.env_json, discovered?.env || {})
    const source = discovered?.source || (String(row.id || '').startsWith('builtin-') ? 'builtin' : 'custom')
    const inspect = this.inspectCommand(command)

    return {
      ...row,
      name: row.name || discovered?.name || '',
      description: row.description || discovered?.description || '',
      command,
      args,
      env,
      isEnabled: !!row.is_enabled,
      enabled: !!row.is_enabled,
      source,
      serverIdentifier: discovered?.serverIdentifier || this.slugify(row.name || row.id || ''),
      path: discovered?.path || '',
      transport: discovered?.transport || 'stdio',
      toolCount: discovered?.toolCount || 0,
      tools: discovered?.tools || [],
      hasInstructions: discovered?.hasInstructions || false,
      instructions: discovered?.instructions || '',
      compatibleProviders: discovered?.compatibleProviders || 'all',
      tags: discovered?.tags || [],
      author: discovered?.author || '',
      homepage: discovered?.homepage || '',
      installMethod: discovered?.installMethod || '',
      installCommand: discovered?.installCommand || '',
      category: discovered?.category || 'custom',
      removable: source !== 'builtin',
      isInstalled: inspect.ok,
      resolvedCommand: inspect.resolvedCommand,
    }
  }

  private getInternal(id: string, discovered?: Map<string, DiscoveredServer>): any {
    const row = this.db.raw.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as any
    return row ? this.mergeRow(row, discovered?.get(id)) : null
  }

  private listInternal(onlyEnabled: boolean): any[] {
    const discovered = this.syncBuiltinsInternal()
    const sql = onlyEnabled
      ? 'SELECT * FROM mcp_servers WHERE is_enabled = 1 ORDER BY name'
      : 'SELECT * FROM mcp_servers ORDER BY name'

    return this.db.raw.prepare(sql).all().map((row: any) => this.mergeRow(row, discovered.get(row.id)))
  }

  list(): any[] {
    return this.listInternal(false)
  }

  get(id: string): any {
    const discovered = this.syncBuiltinsInternal()
    return this.getInternal(id, discovered)
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

  seedBuiltins(): void {
    this.syncBuiltinsInternal()
  }

  getEnabledServerConfigs(): Record<string, { command: string; args: string[]; env: Record<string, string>; cwd?: string }> {
    const configs: Record<string, { command: string; args: string[]; env: Record<string, string>; cwd?: string }> = {}

    for (const server of this.listInternal(true)) {
      if (server.id === 'builtin-agent-control') continue

      const key = server.serverIdentifier || this.slugify(server.name || server.id || '')
      if (!key) continue

      configs[key] = {
        command: server.command || 'node',
        args: Array.isArray(server.args) ? server.args : [],
        env: server.env && typeof server.env === 'object' ? server.env : {},
        ...(server.path ? { cwd: server.path } : {}),
      }
    }

    return configs
  }

  getEnabledServerSummaries(limit = 24): McpSummary[] {
    return this.listInternal(true)
      .filter(server => server.id !== 'builtin-agent-control')
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
      .run(data.name || '', data.description || '', data.command || '', JSON.stringify(data.args || []), JSON.stringify(data.env || {}), data.isEnabled ? 1 : 0, now, id)
  }
  delete(id: string): void { this.uninstall(id) }
}
