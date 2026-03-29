/**
 * ProviderService - manages AI provider configurations
 * Replaces Go internal/services/provider.go
 */

import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

export interface AIProvider {
  id: string
  name: string
  command: string
  isBuiltin: boolean
  adapterType: string
  envOverrides: string
  executablePath: string
  nodeVersion: string
  autoAcceptFlag: string
  resumeFlag: string
  defaultArgs: string
  autoAcceptArg: string
  resumeArg: string
  sessionIdDetection: string
  resumeFormat: string
  sessionIdPattern: string
  gitBashPath: string
  defaultModel: string
  maxOutputTokens: number
  reasoningEffort: string
  preferResponsesApi: boolean
  sortOrder: number
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

function rowToProvider(row: any): AIProvider {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    isBuiltin: !!row.is_builtin,
    adapterType: row.adapter_type || '',
    envOverrides: row.env_overrides || '',
    executablePath: row.executable_path || '',
    nodeVersion: row.node_version || '',
    autoAcceptFlag: row.auto_accept_flag || '',
    resumeFlag: row.resume_flag || '',
    defaultArgs: row.default_args || '',
    autoAcceptArg: row.auto_accept_arg || '',
    resumeArg: row.resume_arg || '',
    sessionIdDetection: row.session_id_detection || '',
    resumeFormat: row.resume_format || '',
    sessionIdPattern: row.session_id_pattern || '',
    gitBashPath: row.git_bash_path || '',
    defaultModel: row.default_model || '',
    maxOutputTokens: row.max_output_tokens || 0,
    reasoningEffort: row.reasoning_effort || '',
    preferResponsesApi: !!row.prefer_responses_api,
    sortOrder: row.sort_order || 0,
    isEnabled: !!row.is_enabled,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function extractExecutableTarget(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('"')) {
    const endIndex = trimmed.indexOf('"', 1)
    return endIndex > 1 ? trimmed.slice(1, endIndex) : trimmed.slice(1)
  }

  if (trimmed.startsWith("'")) {
    const endIndex = trimmed.indexOf("'", 1)
    return endIndex > 1 ? trimmed.slice(1, endIndex) : trimmed.slice(1)
  }

  const firstWhitespace = trimmed.search(/\s/)
  return firstWhitespace === -1 ? trimmed : trimmed.slice(0, firstWhitespace)
}

function pathExists(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isFile()
  } catch {
    return false
  }
}

function executableExtensions(target: string): string[] {
  if (process.platform !== 'win32') return ['']

  const lowerTarget = target.toLowerCase()
  const pathExts = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map(ext => ext.trim())
    .filter(Boolean)

  const extensions = new Set<string>([''])
  for (const ext of pathExts) {
    if (!lowerTarget.endsWith(ext.toLowerCase())) {
      extensions.add(ext)
    }
  }

  return [...extensions]
}

function resolveExecutable(target: string): boolean {
  const executable = extractExecutableTarget(target)
  if (!executable) return false

  const tryCandidate = (basePath: string) => executableExtensions(basePath).some((ext) => {
    const candidate = ext ? `${basePath}${ext}` : basePath
    return pathExists(candidate)
  })

  if (path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) {
    return tryCandidate(path.resolve(executable)) || tryCandidate(executable)
  }

  const pathEntries = (process.env.PATH || '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean)

  for (const entry of pathEntries) {
    if (tryCandidate(path.join(entry, executable))) {
      return true
    }
  }

  return false
}

export class ProviderService {
  constructor(private db: Database) {}

  getAll(): AIProvider[] {
    const rows = this.db.raw.prepare(
      'SELECT * FROM providers ORDER BY sort_order ASC'
    ).all()
    return rows.map(rowToProvider)
  }

  getById(id: string): AIProvider | null {
    const row = this.db.raw.prepare('SELECT * FROM providers WHERE id = ?').get(id)
    return row ? rowToProvider(row) : null
  }

  create(name: string, command: string, adapterType: string): AIProvider {
    const id = uuidv4()
    const now = new Date().toISOString()
    const maxOrder = this.db.raw.prepare(
      'SELECT MAX(sort_order) as m FROM providers'
    ).get() as any
    const sortOrder = (maxOrder?.m || 0) + 1

    this.db.raw.prepare(`
      INSERT INTO providers (id, name, command, adapter_type, is_builtin, is_enabled, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)
    `).run(id, name, command, adapterType, sortOrder, now, now)

    return this.getById(id)!
  }

  update(id: string, updates: Record<string, any>): void {
    const now = new Date().toISOString()
    const columnMap: Record<string, string> = {
      name: 'name',
      command: 'command',
      adapterType: 'adapter_type',
      envOverrides: 'env_overrides',
      executablePath: 'executable_path',
      nodeVersion: 'node_version',
      autoAcceptFlag: 'auto_accept_flag',
      resumeFlag: 'resume_flag',
      defaultArgs: 'default_args',
      autoAcceptArg: 'auto_accept_arg',
      resumeArg: 'resume_arg',
      sessionIdDetection: 'session_id_detection',
      resumeFormat: 'resume_format',
      sessionIdPattern: 'session_id_pattern',
      gitBashPath: 'git_bash_path',
      defaultModel: 'default_model',
      maxOutputTokens: 'max_output_tokens',
      reasoningEffort: 'reasoning_effort',
      preferResponsesApi: 'prefer_responses_api',
      sortOrder: 'sort_order',
      isEnabled: 'is_enabled',
    }

    const sets: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key]
      if (col) {
        sets.push(`${col} = ?`)
        if (typeof value === 'boolean') {
          values.push(value ? 1 : 0)
        } else {
          values.push(value)
        }
      }
    }

    if (sets.length === 0) return

    sets.push('updated_at = ?')
    values.push(now)
    values.push(id)

    this.db.raw.prepare(
      `UPDATE providers SET ${sets.join(', ')} WHERE id = ?`
    ).run(...values)
  }

  delete(id: string): void {
    // Prevent deleting builtin providers
    const provider = this.getById(id)
    if (provider?.isBuiltin) return
    this.db.raw.prepare('DELETE FROM providers WHERE id = ?').run(id)
  }

  testExecutable(id: string, executablePath: string): boolean {
    const provider = this.getById(id)
    const target = executablePath.trim()
      || provider?.executablePath?.trim()
      || provider?.command?.trim()
      || ''

    return resolveExecutable(target)
  }
}
