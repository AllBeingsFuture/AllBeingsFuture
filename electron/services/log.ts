/**
 * LogService - Application log management
 * Replaces Go internal/services/log_service.go
 * Full API matching frontend bindings
 *
 * Also exposes a global `appLog()` helper so any module in the main process
 * can write to the frontend-visible log without a direct LogService reference.
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export interface LogEntry {
  level: string
  message: string
  timestamp: string
  source: string
}

const LOG_DIR = path.join(os.homedir(), '.allbeingsfuture', 'logs')
const MAX_ENTRIES = 1000
const AUTO_CLEAR_INTERVAL_MS = 30_000

// ---- Singleton for global access ----
let _instance: LogService | null = null

export class LogService {
  private entries: LogEntry[] = []
  private logFilePath: string
  private autoClearTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    this.logFilePath = path.join(LOG_DIR, `app-${new Date().toISOString().slice(0, 10)}.log`)

    // Register singleton
    _instance = this

    // Auto-clear every 30 seconds
    this.autoClearTimer = setInterval(() => {
      this.entries = []
    }, AUTO_CLEAR_INTERVAL_MS)
  }

  addLog(level: string, message: string, source: string = ''): void {
    const entry: LogEntry = { level, message, timestamp: new Date().toISOString(), source }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES)
    }
    try { fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + '\n') } catch {}
  }

  getRecent(limit: number = 300): LogEntry[] {
    return this.entries.slice(-limit)
  }

  getLogFilePath(): string {
    return this.logFilePath
  }

  clear(): void {
    this.entries = []
  }

  destroy(): void {
    if (this.autoClearTimer) {
      clearInterval(this.autoClearTimer)
      this.autoClearTimer = null
    }
  }
}

/**
 * Global helper — any module can call `appLog('info', 'message', 'source')`
 * and the entry will appear in the frontend log viewer.
 */
export function appLog(level: string, message: string, source: string = ''): void {
  if (_instance) {
    _instance.addLog(level, message, source)
  }
}
