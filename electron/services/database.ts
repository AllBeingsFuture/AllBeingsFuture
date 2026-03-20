/**
 * SQLite Database Service (better-sqlite3)
 *
 * Replaces Go's modernc.org/sqlite database layer.
 * Stores sessions, providers, settings, tasks, workflows, missions, etc.
 */

import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const DB_DIR = path.join(os.homedir(), '.allbeingsfuture')
const DB_PATH = path.join(DB_DIR, 'allbeingsfuture.db')

export class Database {
  private db: BetterSqlite3.Database

  constructor() {
    // Ensure directory exists
    fs.mkdirSync(DB_DIR, { recursive: true })

    this.db = new BetterSqlite3(DB_PATH)

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    // Run migrations
    this.migrate()
  }

  get raw(): BetterSqlite3.Database {
    return this.db
  }

  close() {
    this.db.close()
  }

  private migrate() {
    this.db.exec(`
      -- AI Providers
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        command TEXT NOT NULL DEFAULT '',
        is_builtin INTEGER NOT NULL DEFAULT 0,
        adapter_type TEXT NOT NULL DEFAULT '',
        env_overrides TEXT NOT NULL DEFAULT '',
        executable_path TEXT NOT NULL DEFAULT '',
        node_version TEXT NOT NULL DEFAULT '',
        auto_accept_flag TEXT NOT NULL DEFAULT '',
        resume_flag TEXT NOT NULL DEFAULT '',
        default_args TEXT NOT NULL DEFAULT '',
        auto_accept_arg TEXT NOT NULL DEFAULT '',
        resume_arg TEXT NOT NULL DEFAULT '',
        session_id_detection TEXT NOT NULL DEFAULT '',
        resume_format TEXT NOT NULL DEFAULT '',
        session_id_pattern TEXT NOT NULL DEFAULT '',
        git_bash_path TEXT NOT NULL DEFAULT '',
        default_model TEXT NOT NULL DEFAULT '',
        max_output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_effort TEXT NOT NULL DEFAULT '',
        prefer_responses_api INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL DEFAULT '',
        working_directory TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idle',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        conversation_id TEXT NOT NULL DEFAULT '',
        messages_json TEXT NOT NULL DEFAULT '[]',
        parent_session_id TEXT NOT NULL DEFAULT '',
        worktree_path TEXT NOT NULL DEFAULT '',
        worktree_branch TEXT NOT NULL DEFAULT '',
        worktree_base_commit TEXT NOT NULL DEFAULT '',
        worktree_base_branch TEXT NOT NULL DEFAULT '',
        worktree_source_repo TEXT NOT NULL DEFAULT '',
        worktree_merged INTEGER NOT NULL DEFAULT 0,
        auto_accept INTEGER NOT NULL DEFAULT 0,
        permission_mode TEXT NOT NULL DEFAULT '',
        custom_instructions TEXT NOT NULL DEFAULT '',
        append_system_prompt TEXT NOT NULL DEFAULT '',
        max_turns INTEGER NOT NULL DEFAULT 0,
        context_window TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT ''
      );

      -- Settings (key-value)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );

      -- Tasks (Kanban)
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium',
        session_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        due_date TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      -- Workflows
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        steps_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Workflow Executions
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        current_step INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- Missions
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        steps_json TEXT NOT NULL DEFAULT '[]',
        config_json TEXT NOT NULL DEFAULT '{}',
        results_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

      -- Team Definitions
      CREATE TABLE IF NOT EXISTS team_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        members_json TEXT NOT NULL DEFAULT '[]',
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Team Instances
      CREATE TABLE IF NOT EXISTS team_instances (
        id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idle',
        members_json TEXT NOT NULL DEFAULT '[]',
        messages_json TEXT NOT NULL DEFAULT '[]',
        results_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Skills
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        is_builtin INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Skill Engine columns migration
    `)

    // Add skill engine columns (safe: ignores if already exist)
    const skillColumns = [
      ['slash_command', "TEXT NOT NULL DEFAULT ''"],
      ['type', "TEXT NOT NULL DEFAULT 'prompt'"],
      ['source', "TEXT NOT NULL DEFAULT 'custom'"],
      ['prompt_template', "TEXT NOT NULL DEFAULT ''"],
      ['system_prompt_addition', "TEXT NOT NULL DEFAULT ''"],
      ['input_variables_json', "TEXT NOT NULL DEFAULT '[]'"],
      ['compatible_providers', "TEXT NOT NULL DEFAULT 'all'"],
      ['version', "TEXT NOT NULL DEFAULT ''"],
      ['author', "TEXT NOT NULL DEFAULT ''"],
      ['tags_json', "TEXT NOT NULL DEFAULT '[]'"],
    ]
    for (const [col, def] of skillColumns) {
      try {
        this.db.exec(`ALTER TABLE skills ADD COLUMN ${col} ${def}`)
      } catch {
        // Column already exists, ignore
      }
    }

    this.db.exec(`
      -- MCP Servers
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        command TEXT NOT NULL DEFAULT '',
        args_json TEXT NOT NULL DEFAULT '[]',
        env_json TEXT NOT NULL DEFAULT '{}',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Migrate old builtin-* provider IDs: update session references then delete old rows
      UPDATE sessions SET provider_id = 'claude-code' WHERE provider_id = 'builtin-claude';
      UPDATE sessions SET provider_id = 'codex' WHERE provider_id = 'builtin-codex';
      UPDATE sessions SET provider_id = 'gemini-cli' WHERE provider_id = 'builtin-gemini';
      UPDATE sessions SET provider_id = 'opencode' WHERE provider_id = 'builtin-opencode';
      DELETE FROM providers WHERE id IN ('builtin-claude', 'builtin-codex', 'builtin-gemini', 'builtin-opencode');

      -- Insert builtin providers if not exist
      INSERT OR IGNORE INTO providers (id, name, command, is_builtin, adapter_type, is_enabled, sort_order)
      VALUES
        ('claude-code', 'Claude Code', 'claude', 1, 'claude-sdk', 1, 1),
        ('codex', 'Codex CLI', 'codex', 1, 'codex-appserver', 1, 2),
        ('gemini-cli', 'Gemini CLI', 'gemini', 1, 'gemini-headless', 1, 3),
        ('opencode', 'OpenCode', 'opencode', 1, 'opencode-sdk', 1, 4);

      -- Insert default settings if not exist
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('theme', 'dark'),
        ('fontSize', '14'),
        ('autoWorktree', 'true'),
        ('alwaysReplyInChinese', 'true'),
        ('autoLaunch', 'false'),
        ('notificationEnabled', 'true'),
        ('proxyType', 'none'),
        ('proxyHost', ''),
        ('proxyPort', ''),
        ('proxyUsername', ''),
        ('proxyPassword', ''),
        ('voiceTranscriptionMode', 'openai'),
        ('voiceTranscriptionProviderId', '');

      -- File Changes (tracked by FileChangeTracker)
      CREATE TABLE IF NOT EXISTS file_changes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT '' REFERENCES sessions(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL DEFAULT '',
        change_type TEXT NOT NULL DEFAULT 'modify',
        timestamp INTEGER NOT NULL DEFAULT 0,
        concurrent INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'fs-watch',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id);
      CREATE INDEX IF NOT EXISTS idx_file_changes_path ON file_changes(file_path);
    `)
  }
}
