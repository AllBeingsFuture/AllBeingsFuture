/**
 * SkillService - Skill management with SkillEngine integration.
 * Skills are user-installed only; no built-in or embedded catalog is seeded.
 */

import { v4 as uuidv4 } from 'uuid'
import path from 'node:path'
import type { Database } from './database.js'
import { SkillEngine } from './skill-engine.js'
import type { SkillDef } from './builtin-skills.js'

type SkillSummary = Pick<SkillDef, 'id' | 'name' | 'description' | 'slashCommand' | 'source' | 'type'>

type SkillRow = SkillDef & {
  isEnabled?: boolean
}

export class SkillService {
  private engine: SkillEngine
  private purgedBuiltins = false

  constructor(private db: Database) {
    this.engine = new SkillEngine()
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

  /**
   * Remove previously auto-seeded skills while preserving user custom/marketplace rows.
   * Targets: is_builtin flag, source builtin/local, and id prefixes from the old catalogs.
   */
  private purgeSeededSkills(): void {
    this.db.raw.prepare(`
      DELETE FROM skills
      WHERE is_builtin = 1
         OR source IN ('builtin', 'local')
         OR id LIKE 'builtin-%'
         OR id LIKE 'local-%'
    `).run()
    this.purgedBuiltins = true
  }

  /** One-shot purge on first registry access after process start (also exposed as seedBuiltins). */
  private ensureBuiltinsPurged(): void {
    if (this.purgedBuiltins) return
    this.purgeSeededSkills()
  }

  private mergeRow(row: any): SkillRow {
    const base: SkillDef = {
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      category: row.category || '',
      slashCommand: row.slash_command || '',
      type: (row.type || 'prompt') as 'prompt' | 'native',
      compatibleProviders: this.parseCompatibleProviders(row.compatible_providers),
      promptTemplate: row.prompt_template || row.content || '',
      systemPromptAddition: row.system_prompt_addition || '',
      inputVariables: this.parseJson(row.input_variables_json, []),
      source: (row.source || (row.is_builtin ? 'builtin' : 'custom')) as SkillDef['source'],
      version: row.version || '',
      author: row.author || '',
      tags: this.parseJson(row.tags_json, []),
      system: false,
      toolName: '',
      handler: '',
      path: '',
      rootDir: '',
      scripts: [],
      references: [],
      instructions: '',
      config: this.parseJson(row.config_json, {}),
    }

    return {
      ...base,
      isEnabled: !!row.is_enabled,
    }
  }

  private getByIdInternal(id: string): SkillRow | null {
    const row = this.db.raw.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
    return row ? this.mergeRow(row) : null
  }

  private listInternal(onlyEnabled: boolean): SkillRow[] {
    this.ensureBuiltinsPurged()
    const sql = onlyEnabled
      ? 'SELECT * FROM skills WHERE is_enabled = 1 ORDER BY category, name'
      : 'SELECT * FROM skills ORDER BY category, name'

    return this.db.raw
      .prepare(sql)
      .all()
      .map((row: any) => this.mergeRow(row))
  }

  private reloadEngine(): void {
    this.engine.loadSkills(this.listInternal(true))
  }

  list(): SkillRow[] {
    return this.listInternal(false)
  }

  get(id: string): SkillRow | null {
    this.ensureBuiltinsPurged()
    return this.getByIdInternal(id)
  }

  install(sk: any): SkillRow | null {
    this.ensureBuiltinsPurged()
    const id = sk.id || uuidv4()
    const now = new Date().toISOString()
    // User-installed skills are never marked builtin, even if a caller passes source=builtin.
    const source = sk.source === 'marketplace' ? 'marketplace' : 'custom'
    const isBuiltin = 0
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
      sk.slashCommand || '', sk.type || 'prompt', source,
      sk.promptTemplate || '', sk.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      sk.version || '', sk.author || '', tagsJson,
      now, now,
      sk.name || '', sk.description || '', sk.category || '', sk.promptTemplate || sk.content || '',
      sk.slashCommand || '', sk.type || 'prompt', source,
      sk.promptTemplate || '', sk.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      sk.version || '', sk.author || '', tagsJson,
      now,
    )

    return this.getByIdInternal(id)
  }

  delete(id: string): void {
    this.db.raw.prepare('DELETE FROM skills WHERE id = ?').run(id)
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
      isBuiltin: false,
      category: skill.category,
      slashCommand: skill.slashCommand,
      type: skill.type,
      rootDir: skill.rootDir || path.dirname(skill.path || ''),
      scripts: skill.scripts || [],
      references: skill.references || [],
      instructions: skill.instructions || skill.promptTemplate || '',
    }
  }

  /**
   * Startup hook (name retained for API compatibility).
   * Purges any previously seeded built-in/local skills; does not reinstall any catalog.
   */
  seedBuiltins(): void {
    this.purgeSeededSkills()
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
    const source = data.source === 'marketplace' ? 'marketplace' : 'custom'

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
      data.slashCommand || '', data.type || 'prompt', source,
      data.promptTemplate || '', data.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      data.version || '', data.author || '', tagsJson,
      JSON.stringify(data.config || {}),
      new Date().toISOString(),
      id,
    )
  }
}
