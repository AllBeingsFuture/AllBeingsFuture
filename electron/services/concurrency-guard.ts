/**
 * ConcurrencyGuard - Resource limiting and concurrent session control
 *
 * Ported from SpectrAI ConcurrencyGuard.ts, adapted for AllBeingsFuture's
 * Electron architecture. Controls maximum concurrent sessions and monitors
 * system memory to prevent resource exhaustion.
 */

import os from 'os'

export interface ConcurrencyConfig {
  maxSessions: number
  memoryWarningPercent: number
  memoryBlockPercent: number
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

export class ConcurrencyGuard {
  private config: ConcurrencyConfig
  private activeSessions = 0

  constructor(config?: Partial<ConcurrencyConfig>) {
    this.config = {
      maxSessions: config?.maxSessions ?? 9,
      memoryWarningPercent: config?.memoryWarningPercent ?? 85,
      memoryBlockPercent: config?.memoryBlockPercent ?? 95,
    }
  }

  /**
   * Check whether a new session can be created.
   * Returns { allowed, reason?, warning? } based on session count and memory.
   */
  checkCanCreateSession(): CanCreateResult {
    // Check session count limit
    if (this.activeSessions >= this.config.maxSessions) {
      return {
        allowed: false,
        reason: `Maximum concurrent session limit reached (${this.activeSessions}/${this.config.maxSessions})`,
      }
    }

    // Check system memory
    const memSnapshot = this.getMemorySnapshot()

    if (memSnapshot.usagePercent >= this.config.memoryBlockPercent) {
      return {
        allowed: false,
        reason: `System memory critically high (${Math.round(memSnapshot.usagePercent)}% used, ${Math.round(memSnapshot.availableMB)}MB free). Cannot create new session.`,
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
      currentSessions: this.activeSessions,
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
   */
  registerSession(): void {
    this.activeSessions++
  }

  /**
   * Unregister an active session (call on stop/complete/error).
   */
  unregisterSession(): void {
    if (this.activeSessions > 0) {
      this.activeSessions--
    }
  }

  /**
   * Get the current active session count.
   */
  getActiveSessionCount(): number {
    return this.activeSessions
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<ConcurrencyConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // ── Private ──────────────────────────────────────────────────

  private getMemorySnapshot(): { totalMB: number; availableMB: number; usagePercent: number } {
    const totalMB = os.totalmem() / (1024 * 1024)
    const freeMB = os.freemem() / (1024 * 1024)
    const usagePercent = ((totalMB - freeMB) / totalMB) * 100

    return { totalMB, availableMB: freeMB, usagePercent }
  }
}
