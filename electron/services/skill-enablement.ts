/**
 * Skill enablement policy (no Electron / filesystem deps).
 *
 * - New/synced skills insert with is_enabled = 0
 * - ON CONFLICT never updates is_enabled (does not re-enable disabled skills)
 * - Seed applies: disable non-custom skills, then enable curated allowlist only
 * - Custom user skill rows keep both the row and is_enabled
 */

import { DEFAULT_ENABLED_SKILL_IDS } from './builtin-skills.js'

export { DEFAULT_ENABLED_SKILL_IDS }

/** Insert default for is_enabled on new/synced skills. */
export const SKILL_INSERT_ENABLED_DEFAULT = 0

type StatementLike = {
  // Accept node:sqlite StatementSync and DatabaseCompat statements.
  run: (...params: any[]) => unknown
}

type DbLike = {
  prepare: (sql: string) => StatementLike
}

export type SkillUpsertInput = {
  id: string
  name?: string
  description?: string
  category?: string
  content?: string
  promptTemplate?: string
  systemPromptAddition?: string
  slashCommand?: string
  type?: string
  source?: string
  isBuiltin?: number | boolean
  inputVariablesJson?: string
  compatibleProviders?: string
  version?: string
  author?: string
  tagsJson?: string
}

/**
 * Upsert a skill row. New rows default to disabled.
 * Conflict updates metadata only — never is_enabled.
 */
export function upsertSkillRow(db: DbLike, sk: SkillUpsertInput, now = new Date().toISOString()): void {
  const isBuiltin = sk.isBuiltin ? 1 : sk.source === 'builtin' ? 1 : 0
  const content = sk.promptTemplate || sk.content || ''
  const inputVarsJson = sk.inputVariablesJson ?? '[]'
  const tagsJson = sk.tagsJson ?? '[]'
  const compatProviders = sk.compatibleProviders ?? 'all'
  const source = sk.source || 'custom'
  const type = sk.type || 'prompt'

  db.prepare(`
    INSERT INTO skills (
      id, name, description, category, content,
      is_builtin, is_enabled, config_json,
      slash_command, type, source, prompt_template, system_prompt_addition,
      input_variables_json, compatible_providers, version, author, tags_json,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = ?, description = ?, category = ?, content = ?,
      slash_command = ?, type = ?, source = ?,
      prompt_template = ?, system_prompt_addition = ?,
      input_variables_json = ?, compatible_providers = ?,
      version = ?, author = ?, tags_json = ?,
      updated_at = ?
  `).run(
    sk.id,
    sk.name || '', sk.description || '', sk.category || '', content,
    isBuiltin, SKILL_INSERT_ENABLED_DEFAULT,
    sk.slashCommand || '', type, source,
    sk.promptTemplate || '', sk.systemPromptAddition || '',
    inputVarsJson, compatProviders,
    sk.version || '', sk.author || '', tagsJson,
    now, now,
    sk.name || '', sk.description || '', sk.category || '', content,
    sk.slashCommand || '', type, source,
    sk.promptTemplate || '', sk.systemPromptAddition || '',
    inputVarsJson, compatProviders,
    sk.version || '', sk.author || '', tagsJson,
    now,
  )
}

/**
 * Seed/sync enablement: disable all non-custom skills, then enable only the allowlist.
 * Custom user skill rows are not modified.
 */
export function applyCuratedSkillEnablement(
  db: DbLike,
  allowlist: readonly string[] = DEFAULT_ENABLED_SKILL_IDS,
  now = new Date().toISOString(),
): void {
  db.prepare(
    `UPDATE skills
     SET is_enabled = 0, updated_at = ?
     WHERE IFNULL(source, '') != 'custom'`,
  ).run(now)

  const ids = allowlist.filter(Boolean)
  if (ids.length === 0) return

  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(
    `UPDATE skills
     SET is_enabled = 1, updated_at = ?
     WHERE id IN (${placeholders})`,
  ).run(now, ...ids)
}
