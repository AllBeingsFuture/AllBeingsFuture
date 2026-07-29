import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { BUILTIN_SKILLS, DEFAULT_ENABLED_SKILL_IDS } from '../services/builtin-skills.js'
import {
  SKILL_INSERT_ENABLED_DEFAULT,
  applyCuratedSkillEnablement,
  upsertSkillRow,
} from '../services/skill-enablement.js'

function createSkillsDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      slash_command TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'prompt',
      source TEXT NOT NULL DEFAULT 'custom',
      prompt_template TEXT NOT NULL DEFAULT '',
      system_prompt_addition TEXT NOT NULL DEFAULT '',
      input_variables_json TEXT NOT NULL DEFAULT '[]',
      compatible_providers TEXT NOT NULL DEFAULT 'all',
      version TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

function enabledIds(db: DatabaseSync): string[] {
  return (db.prepare('SELECT id FROM skills WHERE is_enabled = 1 ORDER BY id').all() as Array<{ id: string }>)
    .map(row => row.id)
}

function row(db: DatabaseSync, id: string): any {
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
}

test('curated allowlist is small (3–8) and drawn only from BUILTIN_SKILLS', () => {
  const builtinIds = new Set(BUILTIN_SKILLS.map(skill => skill.id))

  assert.ok(DEFAULT_ENABLED_SKILL_IDS.length >= 3, 'allowlist must have at least 3 skills')
  assert.ok(DEFAULT_ENABLED_SKILL_IDS.length <= 8, 'allowlist must have at most 8 skills')
  assert.equal(new Set(DEFAULT_ENABLED_SKILL_IDS).size, DEFAULT_ENABLED_SKILL_IDS.length, 'allowlist ids must be unique')

  for (const id of DEFAULT_ENABLED_SKILL_IDS) {
    assert.ok(builtinIds.has(id), `allowlist id ${id} must exist in BUILTIN_SKILLS`)
  }

  assert.equal(SKILL_INSERT_ENABLED_DEFAULT, 0, 'new skills must default to disabled')
})

test('upsert inserts new/synced skills as disabled', () => {
  const db = createSkillsDb()

  upsertSkillRow(db, {
    id: 'local-pdf',
    name: 'PDF',
    source: 'local',
    promptTemplate: 'do pdf',
  })
  upsertSkillRow(db, {
    id: 'builtin-code-review',
    name: '代码审查',
    source: 'builtin',
    promptTemplate: 'review',
  })

  assert.equal(row(db, 'local-pdf').is_enabled, 0)
  assert.equal(row(db, 'builtin-code-review').is_enabled, 0)
  db.close()
})

test('ON CONFLICT updates metadata but does not re-enable a disabled skill', () => {
  const db = createSkillsDb()

  upsertSkillRow(db, {
    id: 'local-pdf',
    name: 'PDF',
    description: 'v1',
    source: 'local',
    promptTemplate: 'old',
  })

  // User explicitly enabled the skill
  db.prepare('UPDATE skills SET is_enabled = 1 WHERE id = ?').run('local-pdf')
  assert.equal(row(db, 'local-pdf').is_enabled, 1)

  // User then disables it
  db.prepare('UPDATE skills SET is_enabled = 0 WHERE id = ?').run('local-pdf')
  assert.equal(row(db, 'local-pdf').is_enabled, 0)

  // Re-sync / reinstall must not re-enable
  upsertSkillRow(db, {
    id: 'local-pdf',
    name: 'PDF Tools',
    description: 'v2',
    source: 'local',
    promptTemplate: 'new template',
  })

  const after = row(db, 'local-pdf')
  assert.equal(after.is_enabled, 0, 're-sync must not re-enable disabled skill')
  assert.equal(after.name, 'PDF Tools')
  assert.equal(after.description, 'v2')
  assert.equal(after.prompt_template, 'new template')
  db.close()
})

test('seed/sync disables non-custom skills then enables only curated allowlist', () => {
  const db = createSkillsDb()

  // Simulate ~many local skills previously enabled (legacy bad default)
  for (const skill of BUILTIN_SKILLS) {
    upsertSkillRow(db, {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      source: 'builtin',
      slashCommand: skill.slashCommand,
      type: skill.type,
      promptTemplate: skill.promptTemplate,
      version: skill.version,
      author: skill.author,
      tagsJson: JSON.stringify(skill.tags),
    })
    db.prepare('UPDATE skills SET is_enabled = 1 WHERE id = ?').run(skill.id)
  }

  for (const id of ['local-pdf', 'local-pptx', 'local-system-foo']) {
    upsertSkillRow(db, { id, name: id, source: 'local', promptTemplate: id })
    db.prepare('UPDATE skills SET is_enabled = 1 WHERE id = ?').run(id)
  }

  // Custom user skill (enabled) must survive as a row and keep is_enabled
  upsertSkillRow(db, {
    id: 'custom-my-workflow',
    name: 'My Workflow',
    source: 'custom',
    promptTemplate: 'custom work',
  })
  db.prepare('UPDATE skills SET is_enabled = 1 WHERE id = ?').run('custom-my-workflow')

  applyCuratedSkillEnablement(db)

  const enabled = enabledIds(db)
  assert.deepEqual(
    enabled.filter(id => id !== 'custom-my-workflow').sort(),
    [...DEFAULT_ENABLED_SKILL_IDS].sort(),
    'only curated allowlist (plus preserved custom) should be enabled among registry skills',
  )

  for (const id of DEFAULT_ENABLED_SKILL_IDS) {
    assert.equal(row(db, id).is_enabled, 1, `${id} should be enabled by allowlist`)
  }

  assert.equal(row(db, 'local-pdf').is_enabled, 0)
  assert.equal(row(db, 'local-pptx').is_enabled, 0)
  assert.equal(row(db, 'local-system-foo').is_enabled, 0)

  // Builtins outside allowlist stay off
  const offBuiltin = BUILTIN_SKILLS.map(s => s.id).filter(id => !DEFAULT_ENABLED_SKILL_IDS.includes(id))
  for (const id of offBuiltin) {
    assert.equal(row(db, id).is_enabled, 0, `${id} not on allowlist must stay disabled`)
  }

  // Custom row preserved (not deleted) and enablement preserved
  const custom = row(db, 'custom-my-workflow')
  assert.ok(custom, 'custom user skill row must be preserved')
  assert.equal(custom.is_enabled, 1, 'custom user skill is_enabled must be preserved')
  assert.equal(custom.name, 'My Workflow')
  assert.equal(custom.source, 'custom')

  // Second seed is idempotent for allowlist
  applyCuratedSkillEnablement(db)
  assert.deepEqual(
    enabledIds(db).filter(id => id !== 'custom-my-workflow').sort(),
    [...DEFAULT_ENABLED_SKILL_IDS].sort(),
  )
  assert.equal(row(db, 'custom-my-workflow').is_enabled, 1)

  db.close()
})

test('re-upsert after curated seed does not re-enable local skills', () => {
  const db = createSkillsDb()

  for (const id of DEFAULT_ENABLED_SKILL_IDS) {
    upsertSkillRow(db, { id, name: id, source: 'builtin', promptTemplate: id })
  }
  upsertSkillRow(db, { id: 'local-extra', name: 'Extra', source: 'local', promptTemplate: 'x' })
  applyCuratedSkillEnablement(db)

  assert.equal(row(db, 'local-extra').is_enabled, 0)

  // Discovery re-install during list/sync
  upsertSkillRow(db, {
    id: 'local-extra',
    name: 'Extra Updated',
    source: 'local',
    promptTemplate: 'x2',
  })
  assert.equal(row(db, 'local-extra').is_enabled, 0)
  assert.equal(row(db, 'local-extra').name, 'Extra Updated')

  db.close()
})
