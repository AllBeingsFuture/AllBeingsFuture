/**
 * WorkspaceService - Workspace (multi-repo group) management
 *
 * Provides CRUD for workspaces, directory scanning for Git repos,
 * and VS Code .code-workspace file import.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Database } from './database.js'

const execFileAsync = promisify(execFile)

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

  // ── CRUD ──

  async list(): Promise<Workspace[]> {
    const rows = this.db.raw.prepare('SELECT * FROM workspaces ORDER BY updated_at DESC').all() as any[]
    return rows.map(row => this.hydrateWorkspace(row))
  }

  async create(data: { name: string; description?: string; repos: any[] }): Promise<{ success: boolean; id?: string; error?: string }> {
    const id = randomUUID()
    const now = new Date().toISOString()

    try {
      this.db.raw.transaction(() => {
        this.db.raw.prepare(
          'INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, data.name, data.description || '', now, now)

        for (const repo of data.repos) {
          const repoId = repo.id || randomUUID()
          this.db.raw.prepare(
            'INSERT INTO workspace_repos (id, workspace_id, repo_path, name, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(repoId, id, repo.repoPath, repo.name, repo.isPrimary ? 1 : 0, repo.sortOrder ?? 0)
        }
      })()

      return { success: true, id }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async update(id: string, data: { name: string; description?: string; repos: any[] }): Promise<{ success: boolean; error?: string }> {
    const now = new Date().toISOString()

    try {
      this.db.raw.transaction(() => {
        this.db.raw.prepare(
          'UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?'
        ).run(data.name, data.description || '', now, id)

        // Replace all repos
        this.db.raw.prepare('DELETE FROM workspace_repos WHERE workspace_id = ?').run(id)

        for (const repo of data.repos) {
          const repoId = repo.id || randomUUID()
          this.db.raw.prepare(
            'INSERT INTO workspace_repos (id, workspace_id, repo_path, name, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(repoId, id, repo.repoPath, repo.name, repo.isPrimary ? 1 : 0, repo.sortOrder ?? 0)
        }
      })()

      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async delete(id: string): Promise<void> {
    this.db.raw.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
  }

  // ── Directory scanning ──

  async scanRepos(parentDir: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> {
    try {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true })
      const repos: Array<{ repoPath: string; name: string }> = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const fullPath = path.join(parentDir, entry.name)
        if (await this.isGitRepo(fullPath)) {
          repos.push({ repoPath: fullPath, name: entry.name })
        }
      }

      return { success: true, repos }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async importVscode(filePath: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const workspace = JSON.parse(content) as { folders?: Array<{ path: string; name?: string }> }

      if (!workspace.folders || !Array.isArray(workspace.folders)) {
        return { success: false, error: '无效的 .code-workspace 文件：缺少 folders 字段' }
      }

      const baseDir = path.dirname(filePath)
      const repos = workspace.folders.map(folder => {
        const absPath = path.isAbsolute(folder.path) ? folder.path : path.resolve(baseDir, folder.path)
        return {
          repoPath: absPath,
          name: folder.name || path.basename(absPath),
        }
      })

      return { success: true, repos }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async isGitRepo(dir: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: dir,
        windowsHide: true,
      })
      return true
    } catch {
      return false
    }
  }

  // ── Helpers ──

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
