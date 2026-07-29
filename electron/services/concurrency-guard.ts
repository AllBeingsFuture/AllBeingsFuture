/**
 * ConcurrencyGuard - Resource limiting and concurrent session control
 *
 * Controls maximum concurrent sessions and monitors system memory
 * to prevent resource exhaustion.
 *
 * Uses Set-based tracking (by sessionId) so that unregister is idempotent
 * and double-unregister cannot drift the counter.
 *
 * Memory pressure is warning-only. Node's os.freemem() on macOS counts only
 * fully free pages (file cache / inactive memory look "used"), so freemem-based
 * absolute MB and usage % must not hard-block session creation. Only maxSessions
 * is a hard block.
 */

import os from 'os'

/** Raw memory bytes; injectable for unit tests. */
export type MemoryReader = () => { totalBytes: number; freeBytes: number }

export interface ConcurrencyConfig {
  maxSessions: number
  /** Soft warning when freemem-based usage % exceeds this (not a hard block). */
  memoryWarningPercent: number
  /**
   * @deprecated No longer used as a hard block. Kept for config compatibility;
   * memory pressure is always warning-only because os.freemem() undercounts
   * reclaimable memory on macOS.
   */
  memoryBlockFreeMB?: number
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
      // Deprecated: accepted but ignored for hard-blocking
      memoryBlockFreeMB: config?.memoryBlockFreeMB,
    }
    this.readMemory = readMemory
  }

  /**
   * Check whether a new session can be created.
   * Returns { allowed, reason?, warning? } based on session count and memory.
   *
   * Hard blocks: maxSessions only.
   * Low free memory / high freemem % yields a warning only (macOS freemem is unreliable).
   */
  checkCanCreateSession(): CanCreateResult {
    // Check session count limit — only hard block
    if (this.activeSessionIds.size >= this.config.maxSessions) {
      return {
        allowed: false,
        reason: `Maximum concurrent session limit reached (${this.activeSessionIds.size}/${this.config.maxSessions})`,
      }
    }

    const memSnapshot = this.getMemorySnapshot()
    const freeMB = Math.round(memSnapshot.availableMB)
    const totalMB = Math.round(memSnapshot.totalMB)
    const usedPct = Math.round(memSnapshot.usagePercent)

    // Memory pressure is always warning-only (never hard-block on freemem).
    // High freemem-based usage % or very low absolute free → warn for UI only.
    if (memSnapshot.usagePercent >= this.config.memoryWarningPercent) {
      return {
        allowed: true,
        warning: `High memory usage: ${usedPct}% used (${freeMB}MB free of ${totalMB}MB)`,
      }
    }

    // Soft absolute floor for warning when % is still below the threshold
    // (e.g. small total RAM). Does not block session creation.
    if (memSnapshot.availableMB < 256) {
      return {
        allowed: true,
        warning: `System memory low: ${freeMB}MB free of ${totalMB}MB (${usedPct}% used)`,
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
