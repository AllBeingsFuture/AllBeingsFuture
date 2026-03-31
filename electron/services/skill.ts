/**
 * SkillService - Skill management with SkillEngine integration
 * Combines DB-stored skills with builtin skills and filesystem-discovered skills.
 */

import { v4 as uuidv4 } from 'uuid'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Database } from './database.js'
import { SkillEngine } from './skill-engine.js'
import { BUILTIN_SKILLS } from './builtin-skills.js'
import type { SkillDef } from './builtin-skills.js'

type FrontMatterRecord = Record<string, string | boolean | Record<string, string>>

type SkillSummary = Pick<SkillDef, 'id' | 'name' | 'description' | 'slashCommand' | 'source' | 'type'>

type SkillRow = SkillDef & {
  isEnabled?: boolean
}

export class SkillService {
  private engine: SkillEngine

  constructor(private db: Database) {
    this.engine = new SkillEngine()
  }

  private getSkillsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'skills')
      : path.join(app.getAppPath(), 'electron', 'embedded-assets', 'skills')
  }

  private parseCompatibleProviders(value: string | undefined): string[] | 'all' {
    if (!value || value === 'all') return 'all'
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : 'all'
    } catch {
      return 'all'
    }
  }

  private parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  private parseScalar(value: string): string | boolean {
    const trimmed = value.trim()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
    ) {
      return trimmed.slice(1, -1)
    }
    return trimmed
  }

  private parseFrontMatter(content: string): { attrs: FrontMatterRecord; body: string } {
    if (!content.startsWith('---')) {
      return { attrs: {}, body: content }
    }

    const lines = content.split(/\r?\n/)
    if (lines[0]?.trim() !== '---') {
      return { attrs: {}, body: content }
    }

    const attrs: FrontMatterRecord = {}
    let currentSection: Record<string, string> | null = null
    let index = 1

    for (; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.trim() === '---') {
        index += 1
        break
      }

      const nestedMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/)
      if (nestedMatch && currentSection) {
        const [, key, rawValue] = nestedMatch
        currentSection[key] = String(this.parseScalar(rawValue))
        continue
      }

      const topLevelMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (!topLevelMatch) {
        currentSection = null
        continue
      }

      const [, key, rawValue] = topLevelMatch
      if (!rawValue.trim()) {
        const section: Record<string, string> = {}
        attrs[key] = section
        currentSection = section
        continue
      }

      attrs[key] = this.parseScalar(rawValue)
      currentSection = null
    }

    return {
      attrs,
      body: lines.slice(index).join('\n').trim(),
    }
  }

  private extractDescription(body: string): string {
    const lines = body.split(/\r?\n/)
    const collected: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        if (collected.length > 0) break
        continue
      }
      if (trimmed.startsWith('#')) continue
      collected.push(trimmed)
    }

    return collected.join(' ').trim()
  }

  private collectSkillDirs(rootDir: string): string[] {
    if (!fs.existsSync(rootDir)) return []

    const results: string[] = []
    const walk = (dirPath: string) => {
      let entries: fs.Dirent[] = []
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch {
        return
      }

      if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
        results.push(dirPath)
        return
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue
        if (entry.name === 'node_modules') continue
        walk(path.join(dirPath, entry.name))
      }
    }

    walk(rootDir)
    return results
  }

  private listRelativeFiles(rootDir: string): string[] {
    if (!fs.existsSync(rootDir)) return []

    const results: string[] = []
    const walk = (dirPath: string) => {
      let entries: fs.Dirent[] = []
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const nextPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          walk(nextPath)
          continue
        }
        results.push(path.relative(rootDir, nextPath).split(path.sep).join('/'))
      }
    }

    walk(rootDir)
    return results.sort((left, right) => left.localeCompare(right))
  }

  private buildPromptTemplate(skill: {
    name: string
    description: string
    body: string
    toolName?: string
    handler?: string
  }): string {
    const parts = [
      `请严格按照本地技能 "${skill.name}" 的说明执行任务。`,
    ]

    if (skill.description) {
      parts.push(`技能描述：${skill.description}`)
    }

    if (skill.handler || skill.toolName) {
      const runtimeInfo = [
        skill.handler ? `handler=${skill.handler}` : '',
        skill.toolName ? `tool=${skill.toolName}` : '',
      ].filter(Boolean).join(', ')
      if (runtimeInfo) {
        parts.push(`技能元数据：${runtimeInfo}`)
      }
    }

    if (skill.body) {
      parts.push('以下是技能说明：')
      parts.push(skill.body)
    }

    parts.push('以下是用户当前请求：')
    parts.push('{{user_input}}')

    return parts.join('\n\n')
  }

  private buildFilesystemSkill(skillDir: string, skillsDir: string): SkillDef {
    const skillFile = path.join(skillDir, 'SKILL.md')
    const raw = fs.readFileSync(skillFile, 'utf-8')
    const { attrs, body } = this.parseFrontMatter(raw)
    const metadata = attrs.metadata && typeof attrs.metadata === 'object'
      ? attrs.metadata as Record<string, string>
      : {}
    const relativeDir = path.relative(skillsDir, skillDir).split(path.sep).join('/')
    const dirName = path.basename(skillDir)
    const toolName = typeof attrs['tool-name'] === 'string' ? attrs['tool-name'] : undefined
    const handler = typeof attrs.handler === 'string' ? attrs.handler : undefined
    const isSystem = attrs.system === true || relativeDir.startsWith('system/')
    const slashCommand = String(
      attrs['slash-command']
      || attrs.slash_command
      || dirName,
    ).trim()

    return {
      id: `local-${relativeDir.toLowerCase()}`,
      name: String(attrs.name || dirName).trim(),
      description: String(attrs.description || this.extractDescription(body) || dirName).trim(),
      category: String(attrs.category || relativeDir.split('/', 1)[0] || 'local').trim(),
      slashCommand,
      type: isSystem || toolName || handler ? 'native' : 'prompt',
      compatibleProviders: 'all',
      promptTemplate: this.buildPromptTemplate({
        name: String(attrs.name || dirName).trim(),
        description: String(attrs.description || this.extractDescription(body) || '').trim(),
        body,
        toolName,
        handler,
      }),
      source: 'local',
      version: String(metadata.version || attrs.version || '').trim(),
      author: String(metadata.author || attrs.author || '').trim(),
      tags: [],
      system: isSystem,
      toolName,
      handler,
      path: skillFile,
      rootDir: skillDir,
      scripts: this.listRelativeFiles(path.join(skillDir, 'scripts')),
      references: this.listRelativeFiles(path.join(skillDir, 'references')),
      instructions: body,
    }
  }

  private discoverFilesystemSkills(): Map<string, SkillDef> {
    const skillsDir = this.getSkillsDir()
    const discovered = new Map<string, SkillDef>()

    for (const skillDir of this.collectSkillDirs(skillsDir)) {
      try {
        const skill = this.buildFilesystemSkill(skillDir, skillsDir)
        discovered.set(skill.id, skill)
      } catch {
        // Ignore malformed local skills so one bad skill does not block the registry
      }
    }

    return discovered
  }

  private pruneMissingLocalSkills(validIds: Set<string>): void {
    const rows = this.db.raw
      .prepare("SELECT id FROM skills WHERE source = 'local'")
      .all() as Array<{ id: string }>

    for (const row of rows) {
      if (validIds.has(row.id)) continue
      this.db.raw.prepare("DELETE FROM skills WHERE id = ? AND source = 'local'").run(row.id)
    }
  }

  private syncSkillRegistry(): Map<string, SkillDef> {
    for (const skill of BUILTIN_SKILLS) {
      this.install(skill)
    }

    const discovered = this.discoverFilesystemSkills()
    for (const skill of discovered.values()) {
      this.install(skill)
    }

    this.pruneMissingLocalSkills(new Set(discovered.keys()))
    return discovered
  }

  private mergeRow(row: any, discovered?: SkillDef): SkillRow {
    const base: SkillDef = {
      id: row.id,
      name: row.name || discovered?.name || '',
      description: row.description || discovered?.description || '',
      category: row.category || discovered?.category || '',
      slashCommand: row.slash_command || discovered?.slashCommand || '',
      type: (row.type || discovered?.type || 'prompt') as 'prompt' | 'native',
      compatibleProviders: this.parseCompatibleProviders(row.compatible_providers),
      promptTemplate: row.prompt_template || row.content || discovered?.promptTemplate || '',
      systemPromptAddition: row.system_prompt_addition || discovered?.systemPromptAddition || '',
      inputVariables: this.parseJson(row.input_variables_json, discovered?.inputVariables || []),
      source: (row.source || discovered?.source || (row.is_builtin ? 'builtin' : 'custom')) as SkillDef['source'],
      version: row.version || discovered?.version || '',
      author: row.author || discovered?.author || '',
      tags: this.parseJson(row.tags_json, discovered?.tags || []),
      system: discovered?.system || false,
      toolName: discovered?.toolName || '',
      handler: discovered?.handler || '',
      path: discovered?.path || '',
      rootDir: discovered?.rootDir || '',
      scripts: discovered?.scripts || [],
      references: discovered?.references || [],
      instructions: discovered?.instructions || '',
      config: this.parseJson(row.config_json, {}),
    }

    return {
      ...base,
      isEnabled: !!row.is_enabled,
    }
  }

  private getByIdInternal(id: string, discovered?: Map<string, SkillDef>): SkillRow | null {
    const row = this.db.raw.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
    return row ? this.mergeRow(row, discovered?.get(id)) : null
  }

  private listInternal(onlyEnabled: boolean): SkillRow[] {
    const discovered = this.syncSkillRegistry()
    const sql = onlyEnabled
      ? 'SELECT * FROM skills WHERE is_enabled = 1 ORDER BY category, name'
      : 'SELECT * FROM skills ORDER BY category, name'

    return this.db.raw
      .prepare(sql)
      .all()
      .map((row: any) => this.mergeRow(row, discovered.get(row.id)))
  }

  private reloadEngine(): void {
    this.engine.loadSkills(this.listInternal(true))
  }

  list(): SkillRow[] {
    return this.listInternal(false)
  }

  get(id: string): SkillRow | null {
    const discovered = this.syncSkillRegistry()
    return this.getByIdInternal(id, discovered)
  }

  install(sk: any): SkillRow | null {
    const id = sk.id || uuidv4()
    const now = new Date().toISOString()
    const isBuiltin = sk.source === 'builtin' ? 1 : 0
    const compatProviders = sk.compatibleProviders === 'all'
      ? 'all'
      : JSON.stringify(sk.compatibleProviders || [])
    const inputVarsJson = JSON.stringify(sk.inputVariables || [])
    const tagsJson = JSON.stringify(sk.tags || [])

    this.db.raw.prepare(`
      INSERT INTO skills (
        id, name, description, category, content,
        is_builtin, is_enabled, config_json,
        slash_command, type, source, prompt_template, system_prompt_addition,
        input_variables_json, compatible_providers, version, author, tags_json,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = ?, description = ?, category = ?, content = ?,
        slash_command = ?, type = ?, source = ?,
        prompt_template = ?, system_prompt_addition = ?,
        input_variables_json = ?, compatible_providers = ?,
        version = ?, author = ?, tags_json = ?,
        updated_at = ?
    `).run(
      id,
      sk.name || '', sk.description || '', sk.category || '', sk.promptTemplate || sk.content || '',
      isBuiltin,
      sk.slashCommand || '', sk.type || 'prompt', sk.source || 'custom',
      sk.promptTemplate || '', sk.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      sk.version || '', sk.author || '', tagsJson,
      now, now,
      sk.name || '', sk.description || '', sk.category || '', sk.promptTemplate || sk.content || '',
      sk.slashCommand || '', sk.type || 'prompt', sk.source || 'custom',
      sk.promptTemplate || '', sk.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      sk.version || '', sk.author || '', tagsJson,
      now,
    )

    return this.getByIdInternal(id)
  }

  delete(id: string): void {
    this.db.raw.prepare('DELETE FROM skills WHERE id = ? AND is_builtin = 0').run(id)
  }

  toggleEnabled(id: string, enabled: boolean): void {
    this.db.raw
      .prepare('UPDATE skills SET is_enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), id)
  }

  getRuntimeInfo(id: string): any {
    const skill = this.get(id)
    if (!skill) return null

    return {
      id,
      name: skill.name,
      isEnabled: skill.isEnabled,
      isBuiltin: skill.source === 'builtin',
      category: skill.category,
      slashCommand: skill.slashCommand,
      type: skill.type,
      rootDir: skill.rootDir || path.dirname(skill.path || ''),
      scripts: skill.scripts || [],
      references: skill.references || [],
      instructions: skill.instructions || skill.promptTemplate || '',
    }
  }

  seedBuiltins(): void {
    this.syncSkillRegistry()
  }

  execute(skillId: string, userInput: string): any {
    this.reloadEngine()
    return this.engine.executeSkill(skillId, userInput)
  }

  matchCommand(input: string): any {
    this.reloadEngine()
    return this.engine.matchSlashCommand(input)
  }

  getEnabledSkillSummaries(limit = 48): SkillSummary[] {
    return this.listInternal(true)
      .filter(skill => skill.type === 'prompt')
      .map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        slashCommand: skill.slashCommand,
        source: skill.source,
        type: skill.type,
      }))
      .slice(0, limit)
  }

  getAll(): SkillRow[] {
    return this.list()
  }

  create(data: any): SkillRow | null {
    return this.install(data)
  }

  update(id: string, data: any): void {
    const compatProviders = data.compatibleProviders === 'all'
      ? 'all'
      : JSON.stringify(data.compatibleProviders || [])
    const inputVarsJson = JSON.stringify(data.inputVariables || [])
    const tagsJson = JSON.stringify(data.tags || [])

    this.db.raw.prepare(`
      UPDATE skills SET
        name = ?, description = ?, category = ?, content = ?,
        is_enabled = ?,
        slash_command = ?, type = ?, source = ?,
        prompt_template = ?, system_prompt_addition = ?,
        input_variables_json = ?, compatible_providers = ?,
        version = ?, author = ?, tags_json = ?,
        config_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name || '', data.description || '', data.category || '',
      data.promptTemplate || data.content || '',
      data.isEnabled ? 1 : 0,
      data.slashCommand || '', data.type || 'prompt', data.source || 'custom',
      data.promptTemplate || '', data.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      data.version || '', data.author || '', tagsJson,
      JSON.stringify(data.config || {}),
      new Date().toISOString(),
      id,
    )
  }
}
