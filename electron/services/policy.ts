/**
 * PolicyService - Security policy management
 * Replaces Go internal/services/policy.go
 */

import type { Database } from './database.js'

interface AuditEntry {
  id: string
  timestamp: string
  toolName: string
  params: any
  allowed: boolean
  reason: string
}

interface PolicyConfig {
  enabled: boolean
  autoConfirm: boolean
  blockedCommands: string[]
  blockedPaths: string[]
  dangerousPatterns: Record<string, string[]>
}

const DEFAULT_CONFIG: PolicyConfig = {
  enabled: false,
  autoConfirm: false,
  blockedCommands: [],
  blockedPaths: [],
  dangerousPatterns: {},
}

export class PolicyService {
  private config: PolicyConfig
  private auditLog: AuditEntry[] = []

  constructor(private db: Database) {
    this.config = this.loadConfig()
  }

  private loadConfig(): PolicyConfig {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'policy_config'").get() as any
      if (row?.value) return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) }
    } catch {}
    return { ...DEFAULT_CONFIG }
  }

  private saveConfig(): void {
    const json = JSON.stringify(this.config)
    this.db.raw.prepare(
      "INSERT INTO settings (key, value) VALUES ('policy_config', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    ).run(json, json)
  }

  getConfig(): PolicyConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...config }
    this.saveConfig()
  }

  reloadConfig(): PolicyConfig {
    this.config = this.loadConfig()
    return this.getConfig()
  }

  checkToolAllowed(toolName: string, params: any): { allowed: boolean; reason: string } {
    if (!this.config.enabled) return { allowed: true, reason: '' }

    // Check blocked commands
    if (toolName === 'Bash' || toolName === 'run_shell') {
      const cmd = params?.command || ''
      for (const blocked of this.config.blockedCommands) {
        if (cmd.includes(blocked)) {
          this.addAuditEntry(toolName, params, false, `Blocked command: ${blocked}`)
          return { allowed: false, reason: `Command contains blocked pattern: ${blocked}` }
        }
      }
    }

    // Check blocked paths
    const filePath = params?.file_path || params?.path || ''
    if (filePath) {
      for (const blocked of this.config.blockedPaths) {
        if (filePath.includes(blocked)) {
          this.addAuditEntry(toolName, params, false, `Blocked path: ${blocked}`)
          return { allowed: false, reason: `Path matches blocked pattern: ${blocked}` }
        }
      }
    }

    // Check dangerous patterns
    const patterns = this.config.dangerousPatterns[toolName]
    if (patterns) {
      const paramStr = JSON.stringify(params)
      for (const pattern of patterns) {
        if (new RegExp(pattern).test(paramStr)) {
          this.addAuditEntry(toolName, params, false, `Dangerous pattern: ${pattern}`)
          return { allowed: false, reason: `Matches dangerous pattern for ${toolName}` }
        }
      }
    }

    this.addAuditEntry(toolName, params, true, '')
    return { allowed: true, reason: '' }
  }

  private addAuditEntry(toolName: string, params: any, allowed: boolean, reason: string): void {
    this.auditLog.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      toolName,
      params,
      allowed,
      reason,
    })
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500)
    }
  }

  addBlockedCommand(cmd: string): void {
    if (!this.config.blockedCommands.includes(cmd)) {
      this.config.blockedCommands.push(cmd)
      this.saveConfig()
    }
  }

  removeBlockedCommand(cmd: string): void {
    this.config.blockedCommands = this.config.blockedCommands.filter(c => c !== cmd)
    this.saveConfig()
  }

  addBlockedPath(pattern: string): void {
    if (!this.config.blockedPaths.includes(pattern)) {
      this.config.blockedPaths.push(pattern)
      this.saveConfig()
    }
  }

  removeBlockedPath(pattern: string): void {
    this.config.blockedPaths = this.config.blockedPaths.filter(p => p !== pattern)
    this.saveConfig()
  }

  addDangerousPattern(toolName: string, pattern: string): void {
    if (!this.config.dangerousPatterns[toolName]) {
      this.config.dangerousPatterns[toolName] = []
    }
    if (!this.config.dangerousPatterns[toolName].includes(pattern)) {
      this.config.dangerousPatterns[toolName].push(pattern)
      this.saveConfig()
    }
  }

  getAuditLog(limit: number = 100): AuditEntry[] {
    return this.auditLog.slice(-limit)
  }

  clearAuditLog(): void {
    this.auditLog = []
  }

  setAutoConfirm(auto: boolean): void {
    this.config.autoConfirm = auto
    this.saveConfig()
  }
}
