/**
 * ConcurrencyGuard - Resource limiting and concurrent session control
 *
 * Controls maximum concurrent sessions and monitors system memory
 * to prevent resource exhaustion.
 *
 * Uses Set-based tracking (by sessionId) so that unregister is idempotent
 * and double-unregister cannot drift the counter.
 *
 * Memory hard-block uses absolute free MB only. Node's os.freemem() on macOS
 * counts only fully free pages (file cache / inactive memory look "used"), so
 * freemem-based usage % is warning-only and must not block session creation.
 */

import os from 'os'

/** Raw memory bytes; injectable for unit tests. */
export type MemoryReader = () => { totalBytes: number; freeBytes: number }

export interface ConcurrencyConfig {
  maxSessions: number
  /** Soft warning when freemem-based usage % exceeds this (not a hard block). */
  memoryWarningPercent: number
  /**
   * Hard-block session creation only when absolute free memory is below this (MB).
   * Defaults to 256 MB — true pressure, not macOS freemem false positives.
   */
  memoryBlockFreeMB: number
}

export interface CanCreateResult {
  allowed: boolean
  reason?: string
  warning?: string
}

export interface ResourceStatus {
  currentSessions: number
  maxSessions: number
  memoryUsagePercent: number
  availableMemoryMB: number
  totalMemoryMB: number
  canCreate: boolean
  reason?: string
  warning?: string
}

const defaultMemoryReader: MemoryReader = () => ({
  totalBytes: os.totalmem(),
  freeBytes: os.freemem(),
})

export class ConcurrencyGuard {
  private config: ConcurrencyConfig
  private activeSessionIds = new Set<string>()
  private readMemory: MemoryReader

  constructor(config?: Partial<ConcurrencyConfig>, readMemory: MemoryReader = defaultMemoryReader) {
    this.config = {
      maxSessions: config?.maxSessions ?? 9,
      memoryWarningPercent: config?.memoryWarningPercent ?? 85,
      memoryBlockFreeMB: config?.memoryBlockFreeMB ?? 256,
    }
    this.readMemory = readMemory
  }

  /**
   * Check whether a new session can be created.
   * Returns { allowed, reason?, warning? } based on session count and memory.
   *
   * Hard blocks: maxSessions, or free memory below memoryBlockFreeMB.
   * High freemem % alone only yields a warning (macOS freemem is unreliable).
   */
  checkCanCreateSession(): CanCreateResult {
    // Check session count limit
    if (this.activeSessionIds.size >= this.config.maxSessions) {
      return {
        allowed: false,
        reason: `Maximum concurrent session limit reached (${this.activeSessionIds.size}/${this.config.maxSessions})`,
      }
    }

    // Check system memory — absolute free floor only (not freemem %)
    const memSnapshot = this.getMemorySnapshot()

    if (memSnapshot.availableMB < this.config.memoryBlockFreeMB) {
      return {
        allowed: false,
        reason: `System memory critically low (${Math.round(memSnapshot.availableMB)}MB free of ${Math.round(memSnapshot.totalMB)}MB, ${Math.round(memSnapshot.usagePercent)}% used). Cannot create new session.`,
      }
    }

    if (memSnapshot.usagePercent >= this.config.memoryWarningPercent) {
      return {
        allowed: true,
        warning: `High memory usage: ${Math.round(memSnapshot.usagePercent)}% used (${Math.round(memSnapshot.availableMB)}MB free)`,
      }
    }

    return { allowed: true }
  }

  /**
   * Get current resource usage info for display in the frontend.
   */
  getResourceStatus(): ResourceStatus {
    const memSnapshot = this.getMemorySnapshot()
    const canCreate = this.checkCanCreateSession()

    return {
      currentSessions: this.activeSessionIds.size,
      maxSessions: this.config.maxSessions,
      memoryUsagePercent: Math.round(memSnapshot.usagePercent * 100) / 100,
      availableMemoryMB: Math.round(memSnapshot.availableMB),
      totalMemoryMB: Math.round(memSnapshot.totalMB),
      canCreate: canCreate.allowed,
      reason: canCreate.reason,
      warning: canCreate.warning,
    }
  }

  /**
   * Register a new active session (call after successful init).
   * Idempotent: calling with the same sessionId is a no-op.
   */
  registerSession(sessionId?: string): void {
    if (sessionId) {
      this.activeSessionIds.add(sessionId)
    } else {
      // Fallback for callers that don't pass an ID (legacy compat)
      this.activeSessionIds.add(`__anon_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    }
  }

  /**
   * Unregister an active session (call on stop/complete/error/destroy).
   * Idempotent: calling with an unknown sessionId is a no-op.
   */
  unregisterSession(sessionId?: string): void {
    if (sessionId) {
      this.activeSessionIds.delete(sessionId)
    } else {
      // Fallback: remove the oldest anonymous entry
      const first = this.activeSessionIds.values().next()
      if (!first.done && typeof first.value === 'string' && first.value.startsWith('__anon_')) {
        this.activeSessionIds.delete(first.value)
      }
    }
  }

  /**
   * Get the current active session count.
   */
  getActiveSessionCount(): number {
    return this.activeSessionIds.size
  }

  /**
   * Check if a specific session is registered as active.
   */
  isSessionRegistered(sessionId: string): boolean {
    return this.activeSessionIds.has(sessionId)
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<ConcurrencyConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // ── Private ──────────────────────────────────────────────────

  private getMemorySnapshot(): { totalMB: number; availableMB: number; usagePercent: number } {
    const { totalBytes, freeBytes } = this.readMemory()
    const totalMB = totalBytes / (1024 * 1024)
    const freeMB = freeBytes / (1024 * 1024)
    const usagePercent = totalMB > 0 ? ((totalMB - freeMB) / totalMB) * 100 : 0

    return { totalMB, availableMB: freeMB, usagePercent }
  }
}
