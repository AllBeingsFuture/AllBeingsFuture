/**
 * TrackerService - File change tracking during AI sessions
 * Replaces Go internal/services/tracker.go
 */

import { BrowserWindow } from 'electron'

interface FileChange {
  path: string
  changeType: 'created' | 'modified' | 'deleted'
  timestamp: string
}

interface SessionTracker {
  sessionId: string
  workingDir: string
  status: string
  changes: FileChange[]
  lastActivity: string
}

export class TrackerService {
  private sessions = new Map<string, SessionTracker>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  onSessionStateChange(sessionId: string, status: string, workingDir: string): void {
    let tracker = this.sessions.get(sessionId)
    if (!tracker) {
      tracker = {
        sessionId,
        workingDir,
        status,
        changes: [],
        lastActivity: new Date().toISOString(),
      }
      this.sessions.set(sessionId, tracker)
    } else {
      tracker.status = status
      tracker.workingDir = workingDir
      tracker.lastActivity = new Date().toISOString()
    }
  }

  getSessionChanges(sessionId: string): FileChange[] {
    return this.sessions.get(sessionId)?.changes || []
  }

  recordWorktreeChanges(sessionId: string, _mainRepoPath: string, files: string[]): void {
    const tracker = this.sessions.get(sessionId)
    if (!tracker) return

    const now = new Date().toISOString()
    for (const file of files) {
      tracker.changes.push({
        path: file,
        changeType: 'modified',
        timestamp: now,
      })
    }
    tracker.lastActivity = now

    this.emitUpdate(sessionId)
  }

  handleFsChange(watchedDir: string, filename: string): void {
    // Find session by working directory
    for (const [sessionId, tracker] of this.sessions) {
      if (tracker.workingDir === watchedDir || watchedDir.startsWith(tracker.workingDir)) {
        const fullPath = `${watchedDir}/${filename}`
        tracker.changes.push({
          path: fullPath,
          changeType: 'modified',
          timestamp: new Date().toISOString(),
        })
        tracker.lastActivity = new Date().toISOString()
        this.emitUpdate(sessionId)
        break
      }
    }
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  updateSessionActivity(sessionId: string): void {
    const tracker = this.sessions.get(sessionId)
    if (tracker) {
      tracker.lastActivity = new Date().toISOString()
    }
  }

  findSessionIDByWorkingDir(worktreeDir: string): string {
    for (const [sessionId, tracker] of this.sessions) {
      if (tracker.workingDir === worktreeDir) return sessionId
    }
    return ''
  }

  destroy(): void {
    this.sessions.clear()
  }

  private emitUpdate(sessionId: string): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('tracker:filesUpdated', {
        sessionId,
        changes: this.getSessionChanges(sessionId),
      })
    }
  }
}
