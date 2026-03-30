/**
 * BotService - Unified IM bot configuration management
 * Replaces Go internal/services/bot.go
 */

import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.js'

type BotConfig = Record<string, any>

interface BotCredentialField {
  key: string
  label: string
  secret?: boolean
  hint?: string
}

interface BotCatalogItem {
  type: string
  label: string
  category: string
  source: 'openclaw-ui' | 'openclaw-extension' | 'abf'
  sourceLabel: string
  controlSurface: 'card' | 'extension' | 'legacy'
  extensionId?: string
  description: string
  integrationLabel: string
  supportsTestPush: boolean
  hasDedicatedSettings: boolean
  fields: BotCredentialField[]
}

const BOT_CATALOG: BotCatalogItem[] = [
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    category: '消费聊天',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'whatsapp',
    description: 'OpenClaw 核心渠道之一，原版以扫码登录和运行态探测为主。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'account_id', label: 'Account ID', hint: '多实例时建议显式指定账号 ID。' },
      { key: 'session_name', label: 'Session Name', hint: '用于区分本地会话目录。' },
    ],
  },
  {
    type: 'telegram',
    label: 'Telegram',
    category: '消费聊天',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'telegram',
    description: 'OpenClaw 与 ABF 都已有入口；当前 ABF 已接通测试推送。',
    integrationLabel: '已接通测试推送',
    supportsTestPush: true,
    hasDedicatedSettings: false,
    fields: [
      { key: 'bot_token', label: 'Bot Token', secret: true },
      { key: 'chat_id', label: '推送 Chat ID', hint: '用于 ABF 测试推送。' },
      { key: 'webhook_url', label: 'Webhook URL' },
      { key: 'proxy', label: 'Proxy (http/socks5)' },
    ],
  },
  {
    type: 'discord',
    label: 'Discord',
    category: '社区协作',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'discord',
    description: 'OpenClaw UI 已有专门控制卡片，适合社区型机器人接入。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'bot_token', label: 'Bot Token', secret: true },
      { key: 'application_id', label: 'Application ID' },
      { key: 'public_key', label: 'Public Key', secret: true },
    ],
  },
  {
    type: 'googlechat',
    label: 'Google Chat',
    category: '企业协作',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'googlechat',
    description: 'OpenClaw UI 已内置状态卡片与配置表单。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'webhook_url', label: 'Webhook URL' },
      { key: 'service_account_json', label: 'Service Account JSON', secret: true },
      { key: 'audience', label: 'Audience' },
    ],
  },
  {
    type: 'slack',
    label: 'Slack',
    category: '企业协作',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'slack',
    description: 'OpenClaw UI 已内置状态卡片与配置表单。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'bot_token', label: 'Bot Token', secret: true },
      { key: 'app_token', label: 'App Token', secret: true },
      { key: 'signing_secret', label: 'Signing Secret', secret: true },
    ],
  },
  {
    type: 'signal',
    label: 'Signal',
    category: '私密通信',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'signal',
    description: 'OpenClaw UI 已有专门卡片，通常依赖独立 signal bridge。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'base_url', label: 'Bridge Base URL' },
      { key: 'phone_number', label: 'Phone Number' },
      { key: 'api_key', label: 'API Key', secret: true },
    ],
  },
  {
    type: 'imessage',
    label: 'iMessage',
    category: '设备桥接',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'imessage',
    description: 'OpenClaw UI 已有专门卡片，原版依赖本机 CLI 与消息数据库。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'cli_path', label: 'CLI Path' },
      { key: 'db_path', label: 'DB Path' },
    ],
  },
  {
    type: 'nostr',
    label: 'Nostr',
    category: '协议网络',
    source: 'openclaw-ui',
    sourceLabel: 'OpenClaw UI 卡片',
    controlSurface: 'card',
    extensionId: 'nostr',
    description: 'OpenClaw UI 已有专门卡片，并带 profile 编辑流程。',
    integrationLabel: '已加入控制目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'private_key', label: 'Private Key', secret: true },
      { key: 'public_key', label: 'Public Key' },
      { key: 'relay_urls', label: 'Relay URLs', hint: '多个 relay 可用逗号分隔。' },
    ],
  },
  {
    type: 'bluebubbles',
    label: 'BlueBubbles',
    category: '设备桥接',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'bluebubbles',
    description: 'OpenClaw 扩展层渠道，常用于桥接 iMessage 生态。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'server_url', label: 'Server URL' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'api_key', label: 'API Key', secret: true },
    ],
  },
  {
    type: 'feishu',
    label: '飞书',
    category: '中国办公',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'feishu',
    description: 'OpenClaw 扩展层渠道，适合企业机器人与群消息分发。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'app_id', label: 'App ID' },
      { key: 'app_secret', label: 'App Secret', secret: true },
    ],
  },
  {
    type: 'irc',
    label: 'IRC',
    category: '协议网络',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'irc',
    description: '经典 IRC 渠道，适合轻量文本机器人。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'server', label: 'Server' },
      { key: 'nick', label: 'Nick' },
      { key: 'channels', label: 'Channels', hint: '多个频道可用逗号分隔。' },
    ],
  },
  {
    type: 'line',
    label: 'LINE',
    category: '消费聊天',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'line',
    description: 'OpenClaw 扩展层渠道，常用于东亚地区 Bot 接入。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'channel_access_token', label: 'Channel Access Token', secret: true },
      { key: 'channel_secret', label: 'Channel Secret', secret: true },
    ],
  },
  {
    type: 'matrix',
    label: 'Matrix',
    category: '协议网络',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'matrix',
    description: 'OpenClaw 扩展层渠道，适合自建联邦消息网络。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'homeserver_url', label: 'Homeserver URL' },
      { key: 'access_token', label: 'Access Token', secret: true },
      { key: 'user_id', label: 'User ID' },
    ],
  },
  {
    type: 'mattermost',
    label: 'Mattermost',
    category: '企业协作',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'mattermost',
    description: 'OpenClaw 扩展层渠道，适合私有化团队协作场景。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'server_url', label: 'Server URL' },
      { key: 'bot_token', label: 'Bot Token', secret: true },
      { key: 'team', label: 'Team' },
    ],
  },
  {
    type: 'msteams',
    label: 'Microsoft Teams',
    category: '企业协作',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'msteams',
    description: 'OpenClaw 扩展层渠道，对接 Microsoft Teams Bot。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'app_id', label: 'App ID' },
      { key: 'app_password', label: 'App Password', secret: true },
      { key: 'tenant_id', label: 'Tenant ID' },
    ],
  },
  {
    type: 'nextcloud-talk',
    label: 'Nextcloud Talk',
    category: '企业协作',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'nextcloud-talk',
    description: 'OpenClaw 扩展层渠道，对接自托管协作系统。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'server_url', label: 'Server URL' },
      { key: 'token', label: 'Token', secret: true },
      { key: 'app_secret', label: 'App Secret', secret: true },
    ],
  },
  {
    type: 'synology-chat',
    label: 'Synology Chat',
    category: '企业协作',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'synology-chat',
    description: 'OpenClaw 扩展层渠道，适合群晖协作消息推送。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'webhook_url', label: 'Webhook URL' },
      { key: 'token', label: 'Token', secret: true },
    ],
  },
  {
    type: 'tlon',
    label: 'Tlon / Urbit',
    category: '协议网络',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'tlon',
    description: 'OpenClaw 扩展层渠道，用于 Urbit / Tlon 生态接入。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'ship', label: 'Ship' },
      { key: 'base_url', label: 'Base URL' },
      { key: 'code', label: 'Code', secret: true },
    ],
  },
  {
    type: 'zalo',
    label: 'Zalo OA',
    category: '中国办公',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'zalo',
    description: 'OpenClaw 扩展层渠道，对接 Zalo 官方账号。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'app_id', label: 'App ID' },
      { key: 'secret_key', label: 'Secret Key', secret: true },
      { key: 'oa_id', label: 'OA ID' },
    ],
  },
  {
    type: 'zalouser',
    label: 'Zalo User',
    category: '中国办公',
    source: 'openclaw-extension',
    sourceLabel: 'OpenClaw 扩展层',
    controlSurface: 'extension',
    extensionId: 'zalouser',
    description: 'OpenClaw 扩展层渠道，对接用户态 Zalo 会话。',
    integrationLabel: '扩展目录已接入',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'phone_number', label: 'Phone Number' },
      { key: 'cookie', label: 'Cookie', secret: true },
      { key: 'imei', label: 'IMEI / Device ID' },
    ],
  },
  {
    type: 'dingtalk',
    label: '钉钉',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 Bot 类型，保留兼容配置入口。',
    integrationLabel: 'ABF 兼容目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'client_id', label: 'Client ID / App Key' },
      { key: 'client_secret', label: 'Client Secret', secret: true },
    ],
  },
  {
    type: 'wework',
    label: '企业微信 (HTTP)',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 Bot 类型，保留兼容配置入口。',
    integrationLabel: 'ABF 兼容目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'corp_id', label: 'Corp ID' },
      { key: 'token', label: 'Token', secret: true },
      { key: 'encoding_aes_key', label: 'Encoding AES Key', secret: true },
      { key: 'callback_host', label: 'Callback Host' },
      { key: 'callback_port', label: 'Callback Port' },
    ],
  },
  {
    type: 'wework_ws',
    label: '企业微信 (WS)',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 WS 形态配置入口。',
    integrationLabel: 'ABF 兼容目录',
    supportsTestPush: false,
    hasDedicatedSettings: false,
    fields: [
      { key: 'bot_id', label: 'Bot ID' },
      { key: 'secret', label: 'Secret', secret: true },
    ],
  },
  {
    type: 'onebot',
    label: 'OneBot (正向 WS)',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 OneBot 正向 WebSocket 配置。',
    integrationLabel: '已有高级设置面板',
    supportsTestPush: false,
    hasDedicatedSettings: true,
    fields: [
      { key: 'ws_url', label: 'WebSocket URL' },
      { key: 'access_token', label: 'Access Token', secret: true },
    ],
  },
  {
    type: 'onebot_reverse',
    label: 'OneBot (反向 WS)',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 OneBot 反向 WebSocket 配置。',
    integrationLabel: '已有高级设置面板',
    supportsTestPush: false,
    hasDedicatedSettings: true,
    fields: [
      { key: 'reverse_host', label: 'Listen Host' },
      { key: 'reverse_port', label: 'Listen Port' },
      { key: 'access_token', label: 'Access Token', secret: true },
    ],
  },
  {
    type: 'qqbot',
    label: 'QQ 官方机器人',
    category: '中国办公',
    source: 'abf',
    sourceLabel: 'ABF 兼容目录',
    controlSurface: 'legacy',
    description: 'ABF 原有 QQ 官方 Bot 配置，保留独立高级设置。',
    integrationLabel: '已有高级设置面板',
    supportsTestPush: false,
    hasDedicatedSettings: true,
    fields: [
      { key: 'app_id', label: 'App ID' },
      { key: 'app_secret', label: 'App Secret', secret: true },
      { key: 'sandbox', label: 'Sandbox (true/false)' },
      { key: 'mode', label: 'Mode (websocket/webhook)' },
    ],
  },
]

const BOT_CATALOG_BY_TYPE = new Map(BOT_CATALOG.map(item => [item.type, item]))

function cloneCatalogItem(item: BotCatalogItem): BotCatalogItem {
  return {
    ...item,
    fields: item.fields.map(field => ({ ...field })),
  }
}

function normalizeObject(value: unknown): BotConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...(value as BotConfig) }
}

function normalizeCredentials(value: unknown): Record<string, string> {
  const obj = normalizeObject(value)
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== '')
      .map(([key, fieldValue]) => [key, String(fieldValue)]),
  )
}

export class BotService {
  constructor(private db: Database) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '',
        config_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  getCatalog(): BotCatalogItem[] {
    return BOT_CATALOG.map(item => cloneCatalogItem(item))
  }

  private getCatalogItem(type: string): BotCatalogItem | null {
    const item = BOT_CATALOG_BY_TYPE.get(type)
    return item ? cloneCatalogItem(item) : null
  }

  private enrichBot(bot: BotConfig): BotConfig {
    return {
      ...bot,
      catalog: this.getCatalogItem(String(bot.type || '')),
    }
  }

  private rowToBot(row: any): any {
    const config = normalizeObject(JSON.parse(row.config_json || '{}'))
    return this.enrichBot({
      ...config,
      id: row.id,
      name: row.name,
      type: row.type,
      config,
      credentials: normalizeCredentials(config.credentials),
      agent_profile_id: String(config.agent_profile_id ?? 'default'),
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  private buildConfig(bot: any, existingConfig: BotConfig = {}): BotConfig {
    if (bot?.config && typeof bot.config === 'object' && !Array.isArray(bot.config)) {
      const nextConfig = normalizeObject(bot.config)
      const nextCredentials = normalizeCredentials(
        bot?.credentials ?? nextConfig.credentials ?? existingConfig.credentials,
      )
      const nextAgentProfileId = String(
        bot?.agent_profile_id
        ?? nextConfig.agent_profile_id
        ?? existingConfig.agent_profile_id
        ?? 'default',
      )
      return {
        ...existingConfig,
        ...nextConfig,
        credentials: nextCredentials,
        agent_profile_id: nextAgentProfileId,
      }
    }

    return {
      ...existingConfig,
      credentials: normalizeCredentials(bot?.credentials ?? existingConfig.credentials),
      agent_profile_id: String(bot?.agent_profile_id ?? existingConfig.agent_profile_id ?? 'default'),
    }
  }

  list(): any[] {
    return (this.db.raw.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as any[])
      .map(r => this.rowToBot(r))
  }

  create(bot: any): any {
    const requestedId = typeof bot?.id === 'string' ? bot.id.trim() : ''
    const id = requestedId || uuidv4()
    const exists = this.db.raw.prepare('SELECT id FROM bots WHERE id = ?').get(id) as any
    if (exists?.id) {
      throw new Error(`Bot ID 已存在: ${id}`)
    }

    const now = new Date().toISOString()
    const config = this.buildConfig(bot)
    const catalog = this.getCatalogItem(String(bot?.type || ''))
    const name = typeof bot?.name === 'string' && bot.name.trim()
      ? bot.name.trim()
      : catalog?.label || id

    this.db.raw.prepare(`
      INSERT INTO bots (id, name, type, config_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, bot?.type || '', JSON.stringify(config), bot?.enabled ? 1 : 0, now, now)

    return this.rowToBot(this.db.raw.prepare('SELECT * FROM bots WHERE id = ?').get(id))
  }

  update(botId: string, bot: any): void {
    const now = new Date().toISOString()
    const existing = this.db.raw.prepare('SELECT config_json FROM bots WHERE id = ?').get(botId) as any
    const existingConfig = normalizeObject(JSON.parse(existing?.config_json || '{}'))
    const newConfig = this.buildConfig(bot, existingConfig)

    this.db.raw.prepare(`
      UPDATE bots SET name = COALESCE(?, name), type = COALESCE(?, type),
        config_json = ?, enabled = COALESCE(?, enabled), updated_at = ?
      WHERE id = ?
    `).run(
      typeof bot?.name === 'string' && bot.name.trim() ? bot.name.trim() : null,
      bot?.type ?? null,
      JSON.stringify(newConfig),
      bot?.enabled !== undefined ? (bot.enabled ? 1 : 0) : null,
      now,
      botId,
    )
  }

  delete(botId: string): void {
    this.db.raw.prepare('DELETE FROM bots WHERE id = ?').run(botId)
  }

  toggle(botId: string, enabled: boolean): void {
    this.db.raw.prepare('UPDATE bots SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), botId)
  }
}
