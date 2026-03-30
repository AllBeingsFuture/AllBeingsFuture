/**
 * 文件改动追踪器
 * 通过 FS Watch + 会话状态归因，追踪 AI 会话改动了哪些文件
 * 不依赖 AI provider 输出格式，具有通用性
 */

import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Database, StatementCompat } from '../services/database.js'

// ---- Types ----

export type FileChangeType = 'create' | 'modify' | 'delete'

export interface TrackedFileChange {
  filePath: string
  changeType: FileChangeType
  timestamp: number
  sessionId: string
  concurrent?: boolean
}

// ---- Constants ----

const EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.cache', '.turbo', 'coverage', '.nyc_output',
]
const DEBOUNCE_MS = 300
const MAX_FILES_PER_SESSION = 500

/**
 * 判断路径是否应该被排除（属于构建产物、依赖、版本控制目录）
 */
function shouldExclude(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some(
    pattern =>
      filePath.includes(path.sep + pattern + path.sep) ||
      filePath.includes(path.sep + pattern) ||
      filePath.endsWith(path.sep + pattern),
  )
}

/**
 * 文件改动追踪器
 *
 * 事件：
 * - 'files-updated' (sessionId: string, files: TrackedFileChange[]) — 文件变更时实时推送 + 会话 idle 时 flush
 */
export class FileChangeTracker extends EventEmitter {
  /** 每个唯一目录一个物理 watcher + 引用计数（多会话共用同一目录时复用） */
  private dirWatchers = new Map<string, { watcher: fs.FSWatcher; refCount: number }>()

  /** 会话工作目录映射：sessionId → workingDir */
  private sessionDirs = new Map<string, string>()

  /**
   * ★ worktree session 对应的主仓库路径（sessionId → mainRepoPath）
   * worktree session 的 workingDir 是 .claude/worktrees/xxx，
   * 但 AI 执行 git merge 时会把文件写入主仓库，需要监听主仓库才能捕获这些变更
   */
  private sessionMainRepos = new Map<string, string>()

  /** 活跃窗口：只有 running/starting 状态的会话才有 */
  private activeWindows = new Map<string, { startTime: number; lastActivityTime: number }>()

  /**
   * 变更缓冲（内存，idle 时 flush 到数据库）
   * sessionId → (filePath → TrackedFileChange)，按 filePath 去重，保留最新
   */
  private changeBuffers = new Map<string, Map<string, TrackedFileChange>>()

  /** debounce timers：按 filePath 去抖，300ms 内同一文件只处理一次 */
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  /** 数据库引用（用于写入 file_changes 表） */
  private database: Database | null

  /** prepared statements cache */
  private insertStmt: StatementCompat | null = null

  constructor(database: Database | null) {
    super()
    this.database = database
    this.prepareStatements()
  }

  private prepareStatements(): void {
    if (!this.database) return
    try {
      this.insertStmt = this.database.raw.prepare(`
        INSERT INTO file_changes (id, session_id, file_path, change_type, timestamp, concurrent, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
    } catch {
      // Table may not exist yet; will be created by migration
    }
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * 会话状态变化时调用（由外部 sessionManager 事件驱动）
   */
  onSessionStateChange(sessionId: string, status: string, workingDir: string): void {
    if (!workingDir) return

    const isWorking = status === 'running' || status === 'starting'
    const isFinished =
      status === 'idle' ||
      status === 'completed' ||
      status === 'terminated' ||
      status === 'error' ||
      status === 'interrupted'

    if (isWorking) {
      this.sessionDirs.set(sessionId, workingDir)

      if (!this.activeWindows.has(sessionId)) {
        this.activeWindows.set(sessionId, {
          startTime: Date.now(),
          lastActivityTime: Date.now(),
        })
      }

      if (!this.isWorktreeSession(workingDir)) {
        this.startWatching(sessionId, workingDir)
      } else {
        const mainRepo = this.resolveMainRepo(workingDir)
        if (mainRepo && !this.sessionMainRepos.has(sessionId)) {
          this.sessionMainRepos.set(sessionId, mainRepo)
          this.startWatching(sessionId, mainRepo)
          console.log(`[FileChangeTracker] worktree session ${sessionId}: watching main repo ${mainRepo}`)
        }
      }
    } else if (isFinished) {
      if (this.activeWindows.has(sessionId)) {
        this.activeWindows.delete(sessionId)
        this.flushSession(sessionId)
      }

      const workDir = this.sessionDirs.get(sessionId)
      if (workDir) {
        if (!this.isWorktreeSession(workDir)) {
          this.stopWatching(workDir)
        } else {
          const mainRepo = this.sessionMainRepos.get(sessionId)
          if (mainRepo) {
            this.stopWatching(mainRepo)
            this.sessionMainRepos.delete(sessionId)
          }
        }
      }
    }
  }

  /**
   * 会话有新输出时调用，更新最近活跃时间（用于多会话归因排序）
   */
  updateSessionActivity(sessionId: string): void {
    const window = this.activeWindows.get(sessionId)
    if (window) {
      window.lastActivityTime = Date.now()
    }
  }

  /**
   * 会话彻底销毁时清理所有资源
   */
  removeSession(sessionId: string): void {
    const workDir = this.sessionDirs.get(sessionId)
    if (workDir) {
      if (!this.isWorktreeSession(workDir)) {
        this.stopWatching(workDir)
      } else {
        const mainRepo = this.sessionMainRepos.get(sessionId)
        if (mainRepo) this.stopWatching(mainRepo)
      }
    }
    this.sessionDirs.delete(sessionId)
    this.activeWindows.delete(sessionId)
    this.changeBuffers.delete(sessionId)
    this.sessionMainRepos.delete(sessionId)
  }

  /**
   * 查询会话改动的文件（供 IPC 查询，返回内存中的实时缓冲）
   */
  getSessionChanges(sessionId: string): TrackedFileChange[] {
    const buffer = this.changeBuffers.get(sessionId)
    if (!buffer) return []
    return Array.from(buffer.values())
  }

  /**
   * 根据工作目录反查会话 ID（用于 worktree merge 后归因）
   */
  findSessionIdByWorkingDir(worktreeDir: string): string | null {
    if (!worktreeDir) return null
    const normalized = path.normalize(worktreeDir)
    for (const [sessionId, workDir] of this.sessionDirs) {
      if (path.normalize(workDir) === normalized) {
        return sessionId
      }
    }
    return null
  }

  /**
   * 记录 worktree merge 后的 git diff 文件改动（替代 FS Watch 归因）
   */
  recordWorktreeChanges(
    sessionId: string,
    mainRepoPath: string,
    files: Array<{ path: string; changeType: FileChangeType }>,
  ): void {
    if (files.length === 0) return

    const timestamp = Date.now()
    const changes: TrackedFileChange[] = files.map(f => ({
      filePath: path.join(mainRepoPath, f.path),
      changeType: f.changeType,
      timestamp,
      sessionId,
      concurrent: false,
    }))

    if (!this.changeBuffers.has(sessionId)) {
      this.changeBuffers.set(sessionId, new Map())
    }
    const buffer = this.changeBuffers.get(sessionId)!
    for (const change of changes) {
      buffer.set(change.filePath, change)
    }

    this.persistChanges(changes, 'git-diff')
    this.emit('files-updated', sessionId, changes)

    console.log(
      `[FileChangeTracker] recorded ${changes.length} worktree file changes for session ${sessionId} (source: git-diff)`,
    )
  }

  /**
   * 销毁所有资源（应用退出时调用）
   */
  destroy(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    for (const { watcher } of this.dirWatchers.values()) watcher.close()
    this.debounceTimers.clear()
    this.dirWatchers.clear()
    this.activeWindows.clear()
    this.changeBuffers.clear()
    this.sessionDirs.clear()
    this.sessionMainRepos.clear()
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private isWorktreeSession(workingDir: string): boolean {
    return (
      workingDir.includes('.abf-worktrees') ||
      workingDir.includes('.claudeops-worktrees') ||
      workingDir.includes('.claude/worktrees') ||
      workingDir.includes('.claude\\worktrees')
    )
  }

  /**
   * 从 worktree 路径解析出主仓库路径
   */
  private resolveMainRepo(worktreeDir: string): string | null {
    try {
      const gitFilePath = path.join(worktreeDir, '.git')
      if (!fs.existsSync(gitFilePath)) return null

      const stat = fs.statSync(gitFilePath)
      if (!stat.isFile()) return null

      const content = fs.readFileSync(gitFilePath, 'utf-8').trim()
      const match = content.match(/^gitdir:\s*(.+)$/)
      if (!match) return null

      const worktreeGitDir = path.normalize(match[1].trim())
      const mainGitDir = path.resolve(worktreeGitDir, '..', '..')
      if (path.basename(mainGitDir) !== '.git') return null

      return path.dirname(mainGitDir)
    } catch {
      return null
    }
  }

  private startWatching(sessionId: string, workingDir: string): void {
    const normalizedDir = path.normalize(workingDir)

    const existing = this.dirWatchers.get(normalizedDir)
    if (existing) {
      existing.refCount++
      return
    }

    try {
      const watcher = fs.watch(
        normalizedDir,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFsChange(normalizedDir, filename)
          }
        },
      )

      watcher.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPERM' || err.code === 'ENOENT') {
          console.warn(`[FileChangeTracker] watcher closed for removed/inaccessible dir ${normalizedDir}: ${err.code}`)
        } else {
          console.error(`[FileChangeTracker] watcher error for ${normalizedDir}:`, err)
        }
        this.dirWatchers.delete(normalizedDir)
      })

      this.dirWatchers.set(normalizedDir, { watcher, refCount: 1 })
      console.log(`[FileChangeTracker] watching ${normalizedDir} (session: ${sessionId})`)
    } catch (err) {
      console.error(`[FileChangeTracker] failed to watch ${normalizedDir}:`, err)
    }
  }

  private stopWatching(workingDir: string): void {
    const normalizedDir = path.normalize(workingDir)
    const entry = this.dirWatchers.get(normalizedDir)
    if (!entry) return

    entry.refCount--
    if (entry.refCount <= 0) {
      entry.watcher.close()
      this.dirWatchers.delete(normalizedDir)
      console.log(`[FileChangeTracker] stopped watching ${normalizedDir}`)
    }
  }

  private handleFsChange(watchedDir: string, filename: string): void {
    const fullPath = path.join(watchedDir, filename)

    if (shouldExclude(fullPath)) return

    const existing = this.debounceTimers.get(fullPath)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(fullPath)
      this.attributeChange(fullPath)
    }, DEBOUNCE_MS)

    this.debounceTimers.set(fullPath, timer)
  }

  private attributeChange(fullPath: string): void {
    // 优先检查：文件是否在某个 worktree 的工作目录下
    for (const [sessionId, workDir] of this.sessionDirs) {
      if (this.isWorktreeSession(workDir)) {
        const normalizedWorkDir = path.normalize(workDir)
        if (fullPath.startsWith(normalizedWorkDir) && this.activeWindows.has(sessionId)) {
          this.performAttribution([sessionId], fullPath)
          return
        }
      }
    }

    const candidates: string[] = []

    for (const [sessionId, workDir] of this.sessionDirs) {
      const normalizedWorkDir = path.normalize(workDir)
      if (!this.isWorktreeSession(workDir)) {
        if (fullPath.startsWith(normalizedWorkDir) && this.activeWindows.has(sessionId)) {
          candidates.push(sessionId)
        }
      } else {
        const mainRepo = this.sessionMainRepos.get(sessionId)
        if (mainRepo && fullPath.startsWith(path.normalize(mainRepo)) && this.activeWindows.has(sessionId)) {
          candidates.push(sessionId)
        }
      }
    }

    if (candidates.length === 0) return
    this.performAttribution(candidates, fullPath)
  }

  private performAttribution(candidates: string[], fullPath: string): void {
    let changeType: FileChangeType = 'modify'
    try {
      const stat = fs.statSync(fullPath)
      const existingInAny = candidates.some(sid => {
        const buf = this.changeBuffers.get(sid)
        return buf && buf.has(fullPath)
      })
      if (!existingInAny) {
        const ageMs = Date.now() - stat.birthtimeMs
        if (ageMs < 5000) changeType = 'create'
      }
    } catch {
      changeType = 'delete'
    }

    const timestamp = Date.now()

    if (candidates.length === 1) {
      this.recordChange(candidates[0], fullPath, changeType, timestamp, false)
    } else {
      const winner = this.resolveAttribution(candidates)
      if (winner) {
        this.recordChange(winner, fullPath, changeType, timestamp, false)
      } else {
        for (const sid of candidates) {
          this.recordChange(sid, fullPath, changeType, timestamp, true)
        }
      }
    }
  }

  /**
   * 多会话归因算法
   * Rule 1：工作目录层级更深（更具体）的会话优先
   * Rule 2：同层级时，最近有输出的会话优先；但若最近活跃时间差距 < 1 秒，视为并发
   */
  private resolveAttribution(candidates: string[]): string | null {
    let maxDepth = -1
    let deepestSessions: string[] = []

    for (const sessionId of candidates) {
      const workDir = this.sessionDirs.get(sessionId) ?? ''
      const effectiveDir = this.isWorktreeSession(workDir)
        ? (this.sessionMainRepos.get(sessionId) ?? workDir)
        : workDir
      const depth = effectiveDir.split(path.sep).length

      if (depth > maxDepth) {
        maxDepth = depth
        deepestSessions = [sessionId]
      } else if (depth === maxDepth) {
        deepestSessions.push(sessionId)
      }
    }

    if (deepestSessions.length === 1) return deepestSessions[0]

    let latestTime = -1
    let winner: string | null = null

    for (const sessionId of deepestSessions) {
      const win = this.activeWindows.get(sessionId)
      if (win && win.lastActivityTime > latestTime) {
        latestTime = win.lastActivityTime
        winner = sessionId
      }
    }

    if (winner && deepestSessions.length > 1) {
      const allRecent = deepestSessions.every(sid => {
        const w = this.activeWindows.get(sid)
        return w && latestTime - w.lastActivityTime < 1000
      })
      if (allRecent) return null
    }

    return winner
  }

  private recordChange(
    sessionId: string,
    filePath: string,
    changeType: FileChangeType,
    timestamp: number,
    concurrent: boolean,
  ): void {
    if (!this.changeBuffers.has(sessionId)) {
      this.changeBuffers.set(sessionId, new Map())
    }

    const buffer = this.changeBuffers.get(sessionId)!

    if (!buffer.has(filePath) && buffer.size >= MAX_FILES_PER_SESSION) return

    const change: TrackedFileChange = { filePath, changeType, timestamp, sessionId, concurrent }
    buffer.set(filePath, change)

    this.emit('files-updated', sessionId, [change])
  }

  /**
   * 将缓冲区的变更批量写入 file_changes 表
   */
  private flushSession(sessionId: string): void {
    const buffer = this.changeBuffers.get(sessionId)
    if (!buffer || buffer.size === 0) return

    const changes = Array.from(buffer.values())
    this.persistChanges(changes, 'fs-watch')

    console.log(
      `[FileChangeTracker] flushed ${changes.length} file changes for session ${sessionId}`,
    )
  }

  /**
   * 批量写入 file_changes 表
   */
  private persistChanges(changes: TrackedFileChange[], source: string): void {
    if (!this.database || !this.insertStmt) {
      this.prepareStatements()
      if (!this.insertStmt) return
    }

    const stmt = this.insertStmt
    try {
      const insertMany = this.database!.raw.transaction((items: TrackedFileChange[]) => {
        for (const change of items) {
          const id = uuidv4()
          stmt.run(
            id,
            change.sessionId,
            change.filePath,
            change.changeType,
            change.timestamp,
            change.concurrent ? 1 : 0,
            source,
          )
        }
      })
      insertMany(changes)
    } catch (err) {
      console.error('[FileChangeTracker] failed to persist changes:', err)
    }
  }
}
