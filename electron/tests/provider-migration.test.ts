import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  getBuiltinProviderDefaultById,
  LEGACY_BUILTIN_ACP_UPGRADE_IDS,
  builtinProviderSeedRows,
} from '../services/provider-defaults.js'

/**
 * Exercise the same upgrade SQL semantics used by Database.upgradeBuiltinProvidersToAcp
 * against an isolated temp SQLite file (does not touch ~/.allbeingsfuture).
 */
function applyUpgrade(db: DatabaseSync): void {
  const select = db.prepare(
    'SELECT id, command, adapter_type, default_args, is_builtin FROM providers WHERE id = ?',
  )
  const update = db.prepare(`
    UPDATE providers
    SET command = ?, adapter_type = ?, default_args = ?, updated_at = datetime('now')
    WHERE id = ?
      AND is_builtin = 1
      AND (
        adapter_type != ?
        OR command != ?
        OR IFNULL(default_args, '') != ?
      )
  `)
  const clearLegacyConversation = db.prepare(`
    UPDATE sessions
    SET conversation_id = ''
    WHERE provider_id = ?
      AND IFNULL(conversation_id, '') != ''
  `)

  for (const id of LEGACY_BUILTIN_ACP_UPGRADE_IDS) {
    const row = select.get(id) as
      | { id: string; command: string; adapter_type: string; default_args: string; is_builtin: number }
      | undefined
    if (!row || !row.is_builtin) continue
    const canonical = getBuiltinProviderDefaultById(id)
    if (!canonical) continue

    const needsUpgrade =
      (row.adapter_type || '').toLowerCase() !== 'acp'
      || row.command !== canonical.command
      || (row.default_args || '') !== canonical.defaultArgs
    if (!needsUpgrade) continue

    if ((row.adapter_type || '').toLowerCase() !== 'acp') {
      clearLegacyConversation.run(id)
    }
    update.run(
      canonical.command,
      canonical.adapterType,
      canonical.defaultArgs,
      id,
      canonical.adapterType,
      canonical.command,
      canonical.defaultArgs,
    )
  }
}

function createLegacySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL DEFAULT '',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      adapter_type TEXT NOT NULL DEFAULT '',
      env_overrides TEXT NOT NULL DEFAULT '',
      executable_path TEXT NOT NULL DEFAULT '',
      default_args TEXT NOT NULL DEFAULT '',
      default_model TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT ''
    );
  `)
}

test('idempotent migration upgrades legacy built-ins to ACP without losing user fields', () => {
  // Isolated in-memory/temp DB
  const dirPromise = mkdtemp(path.join(tmpdir(), 'abf-migrate-'))

  return dirPromise.then(async (dir) => {
    const dbPath = path.join(dir, 'test.db')
    try {
      const db = new DatabaseSync(dbPath)
      createLegacySchema(db)

      // Seed legacy rows as older installs would have them
      db.prepare(`
        INSERT INTO providers (
          id, name, command, is_builtin, adapter_type, default_args,
          is_enabled, sort_order, env_overrides, executable_path, default_model
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'claude-code', 'Claude Code', 'claude', 'claude-sdk', '',
        0, 1, 'ANTHROPIC_API_KEY=sk-test', '/custom/claude', 'claude-opus',
      )
      db.prepare(`
        INSERT INTO providers (
          id, name, command, is_builtin, adapter_type, default_args,
          is_enabled, sort_order, env_overrides, executable_path, default_model
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'codex', 'Codex CLI', 'codex', 'codex-appserver', '',
        1, 2, 'OPENAI_API_KEY=sk-codex', '', 'o3',
      )
      db.prepare(`
        INSERT INTO providers (
          id, name, command, is_builtin, adapter_type, default_args,
          is_enabled, sort_order, env_overrides, executable_path, default_model
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'gemini-cli', 'Gemini CLI', 'gemini', 'gemini-headless', '',
        1, 3, '', '', '',
      )
      db.prepare(`
        INSERT INTO providers (
          id, name, command, is_builtin, adapter_type, default_args,
          is_enabled, sort_order, env_overrides, executable_path, default_model
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'opencode', 'OpenCode', 'opencode', 'opencode-sdk', '',
        1, 4, '', '/opt/opencode', '',
      )

      // Legacy conversation ids that must not be silently resumed over ACP
      db.prepare(
        'INSERT INTO sessions (id, provider_id, conversation_id) VALUES (?, ?, ?)',
      ).run('s1', 'claude-code', 'legacy-claude-thread-xyz')
      db.prepare(
        'INSERT INTO sessions (id, provider_id, conversation_id) VALUES (?, ?, ?)',
      ).run('s2', 'codex', 'legacy-codex-thread-abc')

      applyUpgrade(db)

      const claude = db.prepare('SELECT * FROM providers WHERE id = ?').get('claude-code') as any
      assert.equal(claude.adapter_type, 'acp')
      assert.equal(claude.command, 'claude-agent-acp')
      assert.equal(claude.default_args, '')
      assert.equal(claude.is_enabled, 0, 'user disabled flag preserved')
      assert.equal(claude.sort_order, 1)
      assert.equal(claude.env_overrides, 'ANTHROPIC_API_KEY=sk-test')
      assert.equal(claude.executable_path, '/custom/claude')
      assert.equal(claude.default_model, 'claude-opus')

      const codex = db.prepare('SELECT * FROM providers WHERE id = ?').get('codex') as any
      assert.equal(codex.adapter_type, 'acp')
      assert.equal(codex.command, 'codex-acp')
      assert.equal(codex.is_enabled, 1)
      assert.equal(codex.env_overrides, 'OPENAI_API_KEY=sk-codex')
      assert.equal(codex.default_model, 'o3')

      const gemini = db.prepare('SELECT * FROM providers WHERE id = ?').get('gemini-cli') as any
      assert.equal(gemini.adapter_type, 'acp')
      assert.equal(gemini.default_args, '--acp')

      const opencode = db.prepare('SELECT * FROM providers WHERE id = ?').get('opencode') as any
      assert.equal(opencode.adapter_type, 'acp')
      assert.equal(opencode.default_args, 'acp')
      assert.equal(opencode.executable_path, '/opt/opencode')

      const s1 = db.prepare('SELECT conversation_id FROM sessions WHERE id = ?').get('s1') as any
      const s2 = db.prepare('SELECT conversation_id FROM sessions WHERE id = ?').get('s2') as any
      assert.equal(s1.conversation_id, '')
      assert.equal(s2.conversation_id, '')

      // Second run is a no-op (idempotent)
      const before = db.prepare('SELECT command, adapter_type, default_args, updated_at FROM providers WHERE id = ?').get('codex') as any
      applyUpgrade(db)
      const after = db.prepare('SELECT command, adapter_type, default_args, updated_at FROM providers WHERE id = ?').get('codex') as any
      assert.equal(after.command, before.command)
      assert.equal(after.adapter_type, before.adapter_type)
      assert.equal(after.default_args, before.default_args)
      assert.equal(after.updated_at, before.updated_at, 'idempotent re-run must not rewrite rows')

      db.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

test('seed rows alone are already ACP-canonical for fresh installs', () => {
  for (const row of builtinProviderSeedRows()) {
    assert.equal(row.adapterType, 'acp')
    const launch = {
      command: row.command,
      args: row.defaultArgs ? row.defaultArgs.split(/\s+/).filter(Boolean) : [],
    }
    assert.ok(launch.command)
  }
})
