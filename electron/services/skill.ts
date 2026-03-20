/**
 * SkillService - Skill management with SkillEngine integration
 * Combines DB-stored skills with builtin skills and the SkillEngine.
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'
import { SkillEngine } from './skill-engine.js'
import { BUILTIN_SKILLS } from './builtin-skills.js'
import type { SkillDef, SkillVariable } from './builtin-skills.js'

export class SkillService {
  private engine: SkillEngine

  constructor(private db: Database) {
    this.engine = new SkillEngine()
  }

  /**
   * Convert a DB row to a SkillDef object.
   */
  private rowToSkill(row: any): SkillDef {
    return {
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
    }
  }

  /**
   * Parse compatible providers field: 'all' or JSON array string.
   */
  private parseCompatibleProviders(value: string | undefined): string[] | 'all' {
    if (!value || value === 'all') return 'all'
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : 'all'
    } catch {
      return 'all'
    }
  }

  /**
   * Safe JSON parse with fallback.
   */
  private parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  /**
   * Reload skills into the engine from DB.
   */
  private reloadEngine(): void {
    const dbSkills = this.list()
    this.engine.loadSkills(dbSkills)
  }

  /**
   * List all skills from DB.
   */
  list(): SkillDef[] {
    return this.db.raw
      .prepare('SELECT * FROM skills ORDER BY category, name')
      .all()
      .map((r: any) => this.rowToSkill(r))
  }

  /**
   * Get a single skill by ID.
   */
  get(id: string): SkillDef | null {
    const row = this.db.raw.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
    return row ? this.rowToSkill(row) : null
  }

  /**
   * Install (upsert) a skill.
   */
  install(sk: any): SkillDef | null {
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
      // ON CONFLICT SET values
      sk.name || '', sk.description || '', sk.category || '', sk.promptTemplate || sk.content || '',
      sk.slashCommand || '', sk.type || 'prompt', sk.source || 'custom',
      sk.promptTemplate || '', sk.systemPromptAddition || '',
      inputVarsJson, compatProviders,
      sk.version || '', sk.author || '', tagsJson,
      now,
    )
    return this.get(id)
  }

  /**
   * Delete a non-builtin skill.
   */
  delete(id: string): void {
    this.db.raw.prepare('DELETE FROM skills WHERE id = ? AND is_builtin = 0').run(id)
  }

  /**
   * Toggle skill enabled/disabled.
   */
  toggleEnabled(id: string, enabled: boolean): void {
    this.db.raw
      .prepare('UPDATE skills SET is_enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), id)
  }

  /**
   * Get runtime info for a skill.
   */
  getRuntimeInfo(id: string): any {
    const sk = this.get(id)
    if (!sk) return null
    return {
      id,
      name: sk.name,
      isEnabled: true,
      isBuiltin: sk.source === 'builtin',
      category: sk.category,
      slashCommand: sk.slashCommand,
      type: sk.type,
    }
  }

  /**
   * Seed builtin skills into DB (idempotent).
   * Uses BUILTIN_SKILLS definitions instead of filesystem scanning.
   */
  seedBuiltins(): void {
    for (const skill of BUILTIN_SKILLS) {
      this.install(skill)
    }
  }

  /**
   * Execute a skill by ID with user input.
   * Reloads skills from DB, then delegates to SkillEngine.
   */
  execute(skillId: string, userInput: string): any {
    this.reloadEngine()
    return this.engine.executeSkill(skillId, userInput)
  }

  /**
   * Match a slash command from user input (e.g. "/review code here").
   * Reloads skills from DB, then delegates to SkillEngine.
   */
  matchCommand(input: string): any {
    this.reloadEngine()
    return this.engine.matchSlashCommand(input)
  }

  // ---- Legacy methods (backward compat) ----

  getAll(): SkillDef[] {
    return this.list()
  }

  create(data: any): SkillDef | null {
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
