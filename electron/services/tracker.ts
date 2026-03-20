/**
 * TrackerService - File change tracking during AI sessions
 *
 * Delegates to FileChangeTracker for real FS watching with:
 * - 300ms debounce
 * - Multi-session attribution
 * - Git worktree awareness
 * - SQLite persistence (file_changes table)
 */

import { BrowserWindow } from 'electron'
import { FileChangeTracker } from '../tracker/FileChangeTracker.js'
import type { TrackedFileChange, FileChangeType } from '../tracker/FileChangeTracker.js'
import type { Database } from './database.js'

export class TrackerService {
  private tracker: FileChangeTracker
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null, database?: Database | null) {
    this.getWindow = getWindow
    this.tracker = new FileChangeTracker(database ?? null)

    // Forward real-time file change events to renderer
    this.tracker.on('files-updated', (sessionId: string, changes: TrackedFileChange[]) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('tracker:filesUpdated', { sessionId, changes })
      }
    })
  }

  onSessionStateChange(sessionId: string, status: string, workingDir: string): void {
    this.tracker.onSessionStateChange(sessionId, status, workingDir)
  }

  getSessionChanges(sessionId: string): TrackedFileChange[] {
    return this.tracker.getSessionChanges(sessionId)
  }

  recordWorktreeChanges(
    sessionId: string,
    mainRepoPath: string,
    files: Array<{ path: string; changeType: FileChangeType }> | string[],
  ): void {
    // Support legacy string[] format (backward compatible with old IPC callers)
    const normalized = files.map(f => {
      if (typeof f === 'string') {
        return { path: f, changeType: 'modify' as FileChangeType }
      }
      return f
    })
    this.tracker.recordWorktreeChanges(sessionId, mainRepoPath, normalized)
  }

  handleFsChange(_watchedDir: string, _filename: string): void {
    // No-op: FileChangeTracker handles FS watching internally via fs.watch
  }

  removeSession(sessionId: string): void {
    this.tracker.removeSession(sessionId)
  }

  updateSessionActivity(sessionId: string): void {
    this.tracker.updateSessionActivity(sessionId)
  }

  findSessionIDByWorkingDir(worktreeDir: string): string {
    return this.tracker.findSessionIdByWorkingDir(worktreeDir) ?? ''
  }

  destroy(): void {
    this.tracker.destroy()
  }
}
