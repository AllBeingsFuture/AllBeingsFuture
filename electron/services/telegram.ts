/**
 * TelegramService - Telegram bot management
 * Replaces Go internal/services/telegram.go
 */

import type { Database } from './database.js'

interface TelegramConfig {
  botToken: string
  webhookUrl: string
  pollingInterval: number
  [key: string]: any
}

interface AllowedUser {
  userId: string
  username: string
  role: string
}

interface AIProvider {
  id: string
  name: string
  apiKey: string
  model: string
  [key: string]: any
}

export class TelegramService {
  private running = false
  private config: TelegramConfig = { botToken: '', webhookUrl: '', pollingInterval: 1000 }
  private allowedUsers: AllowedUser[] = []
  private aiProviders: AIProvider[] = []

  constructor(private db: Database) {
    this.loadConfig()
  }

  private loadConfig(): void {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'telegram_config'").get() as any
      if (row?.value) this.config = JSON.parse(row.value)
    } catch {}
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'telegram_users'").get() as any
      if (row?.value) this.allowedUsers = JSON.parse(row.value)
    } catch {}
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'telegram_ai_providers'").get() as any
      if (row?.value) this.aiProviders = JSON.parse(row.value)
    } catch {}
  }

  private saveConfig(): void {
    const save = (key: string, value: any) => {
      const json = JSON.stringify(value)
      this.db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, json, json)
    }
    save('telegram_config', this.config)
    save('telegram_users', this.allowedUsers)
    save('telegram_ai_providers', this.aiProviders)
  }

  start(): void { this.running = true }
  stop(): void { this.running = false }
  reload(): void { this.loadConfig() }
  restart(): void { this.stop(); this.loadConfig(); this.start() }

  status(): { running: boolean; config: TelegramConfig } {
    return { running: this.running, config: this.config }
  }

  getConfig(): TelegramConfig { return { ...this.config } }

  updateConfig(key: string, value: any): void {
    (this.config as any)[key] = value
    this.saveConfig()
  }

  getAllowedUsers(): AllowedUser[] { return [...this.allowedUsers] }

  addAllowedUser(userId: string, username: string, role: string): void {
    if (!this.allowedUsers.find(u => u.userId === userId)) {
      this.allowedUsers.push({ userId, username, role })
      this.saveConfig()
    }
  }

  removeAllowedUser(userId: string): void {
    this.allowedUsers = this.allowedUsers.filter(u => u.userId !== userId)
    this.saveConfig()
  }

  getAIProviders(): AIProvider[] { return [...this.aiProviders] }

  addAIProvider(name: string, apiKey: string, model: string): AIProvider {
    const provider: AIProvider = { id: `tg-ai-${Date.now()}`, name, apiKey, model }
    this.aiProviders.push(provider)
    this.saveConfig()
    return provider
  }

  updateAIProvider(id: string, updates: Partial<AIProvider>): void {
    const idx = this.aiProviders.findIndex(p => p.id === id)
    if (idx >= 0) {
      this.aiProviders[idx] = { ...this.aiProviders[idx], ...updates }
      this.saveConfig()
    }
  }

  deleteAIProvider(id: string): void {
    this.aiProviders = this.aiProviders.filter(p => p.id !== id)
    this.saveConfig()
  }
}
