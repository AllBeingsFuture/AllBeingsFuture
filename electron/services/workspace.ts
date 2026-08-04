/**
 * WorkspaceService - Workspace (multi-repo group) management
 *
 * Provides list/hydrate for workspaces used by IPC and worktree cleanup.
 */

import type { Database } from './database.js'

interface WorkspaceRepo {
  id: string
  workspaceId: string
  repoPath: string
  name: string
  isPrimary: boolean
  sortOrder: number
}

interface Workspace {
  id: string
  name: string
  description?: string
  rootPath?: string
  repos: WorkspaceRepo[]
  createdAt: string
  updatedAt: string
}

export class WorkspaceService {
  constructor(private db: Database) {
    this.ensureTables()
  }

  private ensureTables() {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        root_path TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workspace_repos (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        repo_path TEXT NOT NULL,
        name TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_repos_workspace
        ON workspace_repos(workspace_id);
    `)
  }

  async list(): Promise<Workspace[]> {
    const rows = this.db.raw.prepare('SELECT * FROM workspaces ORDER BY updated_at DESC').all() as any[]
    return rows.map(row => this.hydrateWorkspace(row))
  }

  private hydrateWorkspace(row: any): Workspace {
    const repos = this.db.raw.prepare(
      'SELECT * FROM workspace_repos WHERE workspace_id = ? ORDER BY sort_order'
    ).all(row.id) as any[]

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      rootPath: row.root_path || undefined,
      repos: repos.map(r => ({
        id: r.id,
        workspaceId: r.workspace_id,
        repoPath: r.repo_path,
        name: r.name,
        isPrimary: !!r.is_primary,
        sortOrder: r.sort_order,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
