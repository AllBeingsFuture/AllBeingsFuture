/**
 * QQBotService - QQ Bot management
 * Replaces Go internal/services/qqbot.go
 */

import type { Database } from './database.js'

interface QQBotConfig {
  [key: string]: any
}

interface AllowedUser {
  userId: string
  nickname: string
  role: string
}

interface AllowedGroup {
  groupId: string
  groupName: string
  role: string
}

export class QQBotService {
  private running = false
  private config: QQBotConfig = {}
  private allowedUsers: AllowedUser[] = []
  private allowedGroups: AllowedGroup[] = []

  constructor(private db: Database) {
    this.loadConfig()
  }

  private loadConfig(): void {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'qqbot_config'").get() as any
      if (row?.value) this.config = JSON.parse(row.value)
    } catch {}
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'qqbot_users'").get() as any
      if (row?.value) this.allowedUsers = JSON.parse(row.value)
    } catch {}
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'qqbot_groups'").get() as any
      if (row?.value) this.allowedGroups = JSON.parse(row.value)
    } catch {}
  }

  private saveConfig(): void {
    const save = (key: string, value: any) => {
      const json = JSON.stringify(value)
      this.db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, json, json)
    }
    save('qqbot_config', this.config)
    save('qqbot_users', this.allowedUsers)
    save('qqbot_groups', this.allowedGroups)
  }

  start(): void { this.running = true }
  stop(): void { this.running = false }
  reload(): void { this.loadConfig() }
  restart(): void { this.stop(); this.loadConfig(); this.start() }

  status(): { running: boolean } { return { running: this.running } }

  getConfig(): QQBotConfig { return { ...this.config } }

  updateConfig(key: string, value: any): void {
    this.config[key] = value
    this.saveConfig()
  }

  getAllowedUsers(): AllowedUser[] { return [...this.allowedUsers] }

  addAllowedUser(userId: string, nickname: string, role: string): void {
    if (!this.allowedUsers.find(u => u.userId === userId)) {
      this.allowedUsers.push({ userId, nickname, role })
      this.saveConfig()
    }
  }

  removeAllowedUser(userId: string): void {
    this.allowedUsers = this.allowedUsers.filter(u => u.userId !== userId)
    this.saveConfig()
  }

  getAllowedGroups(): AllowedGroup[] { return [...this.allowedGroups] }

  addAllowedGroup(groupId: string, groupName: string, role: string): void {
    if (!this.allowedGroups.find(g => g.groupId === groupId)) {
      this.allowedGroups.push({ groupId, groupName, role })
      this.saveConfig()
    }
  }

  removeAllowedGroup(groupId: string): void {
    this.allowedGroups = this.allowedGroups.filter(g => g.groupId !== groupId)
    this.saveConfig()
  }
}
