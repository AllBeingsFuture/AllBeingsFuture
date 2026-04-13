/**
 * TelegramService - Telegram bot runtime + legacy settings management
 *
 * Current scope:
 * - Poll enabled Telegram bots configured in Bot 管理
 * - Restrict interaction to the configured chat_id / allowed users
 * - Support basic remote-control commands
 * - Forward text / images / voice input to a bound ABF session
 * - Relay assistant replies back to Telegram with streaming preview edits
 */

import { Buffer } from 'node:buffer'
import path from 'node:path'
import type { Database } from './database.js'
import type { BotService } from './bot.js'
import type { Session, SessionService } from './session.js'
import type { AIProvider as DesktopAIProvider, ProviderService } from './provider.js'
import type { ProcessService } from './process.js'
import type { ChatMessage } from './process-types.js'
import { appLog } from './log.js'

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
  apiEndpoint?: string
  apiKey: string
  model: string
  maxTokens?: number
  priority?: number
  [key: string]: any
}

interface TelegramCredentials {
  bot_token?: string
  chat_id?: string
  webhook_url?: string
  proxy?: string
  [key: string]: string | undefined
}

interface TelegramBotRecord {
  id: string
  name: string
  type: string
  enabled: boolean
  credentials: TelegramCredentials
  agent_profile_id?: string
}

interface TelegramBotRuntimeState {
  offset: number
  lastError: string
  lastPolledAt: number
  commandsSynced: boolean
}

interface TelegramChat {
  id: number | string
  type?: string
  title?: string
  username?: string
}

interface TelegramUser {
  id: number | string
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramMessage {
  message_id?: number
  date?: number
  text?: string
  caption?: string
  media_group_id?: string
  photo?: Array<{
    file_id?: string
    file_size?: number
    width?: number
    height?: number
  }>
  voice?: {
    file_id?: string
    file_size?: number
    duration?: number
    mime_type?: string
  }
  audio?: {
    file_id?: string
    file_size?: number
    duration?: number
    mime_type?: string
    file_name?: string
    performer?: string
    title?: string
  }
  document?: {
    file_id?: string
    file_size?: number
    mime_type?: string
    file_name?: string
  }
  chat?: TelegramChat
  from?: TelegramUser
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

interface TelegramApiFile {
  file_id?: string
  file_unique_id?: string
  file_path?: string
  file_size?: number
}

interface TelegramSentMessage {
  message_id?: number
}

type ChatBindings = Record<string, string>
type TelegramUpdateOffsets = Record<string, number>
type TelegramReplyMarkup = Record<string, unknown>
type TelegramTranscriptionProvider = {
  apiEndpoint: string
  apiKey: string
  model: string
  source: string
}

const SETTINGS_KEY_CHAT_BINDINGS = 'telegram_chat_bindings'
const SETTINGS_KEY_UPDATE_OFFSETS = 'telegram_update_offsets'
const DEFAULT_POLLING_INTERVAL_MS = 1500
const MAX_TELEGRAM_MESSAGE_LEN = 3900
const STREAM_PREVIEW_UPDATE_INTERVAL_MS = 1200
const STREAM_PREVIEW_MAX_LEN = 3600
const STARTUP_BACKLOG_GRACE_MS = 10 * 60 * 1000

const TELEGRAM_COMMAND_DEFINITIONS = [
  { command: 'help', description: '查看帮助' },
  { command: 'sessions', description: '查看会话列表' },
  { command: 'dock_telegram', description: '绑定当前聊天到会话' },
  { command: 'undock', description: '解除当前绑定' },
  { command: 'status', description: '查看运行状态' },
  { command: 'stop', description: '停止当前会话输出' },
] as const

const TELEGRAM_MENU_KEYBOARD: TelegramReplyMarkup = {
  keyboard: [
    [{ text: '帮助' }, { text: '会话列表' }],
    [{ text: '绑定会话' }, { text: '解除绑定' }],
    [{ text: '状态' }, { text: '停止' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: '请选择中文菜单命令或直接输入消息',
}

const TELEGRAM_COMMAND_ALIASES: Array<{ pattern: RegExp; resolver: (match: RegExpMatchArray) => string }> = [
  { pattern: /^\/?帮助$/i, resolver: () => '/help' },
  { pattern: /^\/?会话列表$/i, resolver: () => '/sessions' },
  { pattern: /^\/?绑定会话(?:\s+(.+))?$/i, resolver: (match) => `/dock_telegram${match[1] ? ` ${match[1].trim()}` : ''}` },
  { pattern: /^\/?解除绑定$/i, resolver: () => '/undock' },
  { pattern: /^\/?状态$/i, resolver: () => '/status' },
  { pattern: /^\/?停止$/i, resolver: () => '/stop' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function stringifyId(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function parseEnvOverrides(envStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const parsed = JSON.parse(envStr)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]),
      )
    }
  } catch {}

  for (const line of envStr.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }

  return result
}

function normalizeTelegramApiBase(raw?: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return 'https://api.telegram.org'
  return trimmed.replace(/\/+$/, '')
}

function inferMimeTypeFromFileName(fileName: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.ogg':
    case '.oga':
      return 'audio/ogg'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.wav':
      return 'audio/wav'
    case '.webm':
      return 'audio/webm'
    default:
      return fallback
  }
}

function hasImagePayload(message: TelegramMessage): boolean {
  return Boolean(
    (Array.isArray(message.photo) && message.photo.length > 0)
    || (message.document?.file_id && String(message.document.mime_type || '').startsWith('image/')),
  )
}

function hasAudioPayload(message: TelegramMessage): boolean {
  if (message.voice?.file_id || message.audio?.file_id) return true
  if (!message.document?.file_id) return false
  const mimeType = String(message.document.mime_type || '').toLowerCase()
  return mimeType.startsWith('audio/')
    || mimeType === 'application/ogg'
    || /\.(ogg|oga|mp3|m4a|wav|webm)$/i.test(String(message.document.file_name || ''))
}

function resolvePreferredPhotoFileId(message: TelegramMessage): string {
  if (!Array.isArray(message.photo) || message.photo.length === 0) return ''
  const sorted = [...message.photo].sort((left, right) => Number(right.file_size || 0) - Number(left.file_size || 0))
  return sorted[0]?.file_id?.trim() || ''
}

function buildStreamPreviewText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const suffix = '\n\n<i>流式输出中...</i>'
  const available = Math.max(200, STREAM_PREVIEW_MAX_LEN - suffix.length)
  const body = trimmed.length > available
    ? `${trimmed.slice(0, available - 1).trimEnd()}…`
    : trimmed
  return `${body}${suffix}`
}

function normalizeTranscriptionEndpoint(rawEndpoint: string): string {
  const trimmed = rawEndpoint.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    const normalizedPath = url.pathname.replace(/\/+$/, '')
    if (/\/audio\/transcriptions$/i.test(normalizedPath)) {
      return url.toString()
    }
    if (!normalizedPath || normalizedPath === '/') {
      url.pathname = '/v1/audio/transcriptions'
      return url.toString()
    }
    url.pathname = `${normalizedPath}/audio/transcriptions`
    return url.toString()
  } catch {
    if (/\/audio\/transcriptions\/?$/i.test(trimmed)) {
      return trimmed
    }
    return `${trimmed.replace(/\/+$/, '')}/audio/transcriptions`
  }
}

function shortenSessionId(sessionId: string): string {
  return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId
}

function sessionStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'completed':
      return '已完成'
    case 'error':
      return '错误'
    case 'idle':
      return '空闲'
    default:
      return status || '未知'
  }
}

export class TelegramService {
  private running = false
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private polling = false
  private config: TelegramConfig = { botToken: '', webhookUrl: '', pollingInterval: DEFAULT_POLLING_INTERVAL_MS }
  private allowedUsers: AllowedUser[] = []
  private aiProviders: AIProvider[] = []
  private chatBindings: ChatBindings = {}
  private runtimeStates = new Map<string, TelegramBotRuntimeState>()
  private updateOffsets: TelegramUpdateOffsets = {}
  private runtimeStartedAt = Date.now()

  constructor(
    private db: Database,
    private botService: BotService,
    private sessionService: SessionService,
    private providerService: ProviderService,
    private processService: ProcessService,
  ) {
    this.loadConfig()
    this.loadChatBindings()
    this.loadUpdateOffsets()
  }

  private loadConfig(): void {
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'telegram_config'").get() as any
      if (row?.value) this.config = { ...this.config, ...JSON.parse(row.value) }
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

  private loadChatBindings(): void {
    try {
      const row = this.db.raw.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY_CHAT_BINDINGS) as any
      if (row?.value) {
        const parsed = JSON.parse(row.value)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.chatBindings = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value || '')]),
          )
        }
      }
    } catch {}
  }

  private loadUpdateOffsets(): void {
    try {
      const row = this.db.raw.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY_UPDATE_OFFSETS) as any
      if (row?.value) {
        const parsed = JSON.parse(row.value)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.updateOffsets = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
              .filter(([, value]) => Number.isFinite(Number(value)))
              .map(([key, value]) => [key, Number(value)]),
          )
        }
      }
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

  private saveChatBindings(): void {
    const json = JSON.stringify(this.chatBindings)
    this.db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run(SETTINGS_KEY_CHAT_BINDINGS, json, json)
  }

  private saveUpdateOffsets(): void {
    const json = JSON.stringify(this.updateOffsets)
    this.db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run(SETTINGS_KEY_UPDATE_OFFSETS, json, json)
  }

  private getBindingKey(botId: string, chatId: string): string {
    return `${botId}:${chatId}`
  }

  private getBoundSessionId(botId: string, chatId: string): string {
    return this.chatBindings[this.getBindingKey(botId, chatId)] || ''
  }

  private bindSession(botId: string, chatId: string, sessionId: string): void {
    this.chatBindings[this.getBindingKey(botId, chatId)] = sessionId
    this.saveChatBindings()
  }

  private unbindSession(botId: string, chatId: string): void {
    delete this.chatBindings[this.getBindingKey(botId, chatId)]
    this.saveChatBindings()
  }

  private getPollingInterval(): number {
    const configured = Number(this.config.pollingInterval || DEFAULT_POLLING_INTERVAL_MS)
    if (!Number.isFinite(configured) || configured < 500) return DEFAULT_POLLING_INTERVAL_MS
    return configured
  }

  private getEnabledTelegramBots(): TelegramBotRecord[] {
    return this.botService.list()
      .filter((bot: any) => bot?.type === 'telegram' && bot?.enabled)
      .map((bot: any) => ({
        id: String(bot.id || ''),
        name: String(bot.name || bot.id || 'Telegram'),
        type: 'telegram',
        enabled: Boolean(bot.enabled),
        credentials: { ...(bot.credentials || {}) },
        agent_profile_id: typeof bot.agent_profile_id === 'string' ? bot.agent_profile_id : 'default',
      }))
      .filter((bot) => bot.credentials.bot_token?.trim())
  }

  private ensureRuntimeState(botId: string): TelegramBotRuntimeState {
    const existing = this.runtimeStates.get(botId)
    if (existing) return existing
    const created: TelegramBotRuntimeState = {
      offset: Number(this.updateOffsets[botId] || 0),
      lastError: '',
      lastPolledAt: 0,
      commandsSynced: false,
    }
    this.runtimeStates.set(botId, created)
    return created
  }

  private scheduleNextPoll(delay = this.getPollingInterval()): void {
    if (!this.running) return
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      void this.pollBots()
    }, delay)
  }

  private async pollBots(): Promise<void> {
    if (!this.running) return
    if (this.polling) {
      this.scheduleNextPoll()
      return
    }

    this.polling = true
    try {
      const bots = this.getEnabledTelegramBots()
      const activeIds = new Set(bots.map(bot => bot.id))
      for (const botId of [...this.runtimeStates.keys()]) {
        if (!activeIds.has(botId)) {
          this.runtimeStates.delete(botId)
          delete this.updateOffsets[botId]
        }
      }

      for (const bot of bots) {
        await this.pollSingleBot(bot)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appLog('error', `Telegram polling failed: ${message}`, 'telegram')
    } finally {
      this.polling = false
      this.scheduleNextPoll()
    }
  }

  private async pollSingleBot(bot: TelegramBotRecord): Promise<void> {
    const token = bot.credentials.bot_token?.trim()
    if (!token) return

    const state = this.ensureRuntimeState(bot.id)
    const hadStoredOffset = Number(this.updateOffsets[bot.id] || 0) > 0
    try {
      if (!state.commandsSynced) {
        await this.syncTelegramMenu(bot)
        state.commandsSynced = true
      }

      appLog('debug', `Polling Telegram bot "${bot.name}" with offset=${state.offset}`, 'telegram')
      const updates = await this.callTelegramApi<TelegramUpdate[]>(token, 'getUpdates', {
        offset: state.offset || undefined,
        timeout: 0,
        allowed_updates: ['message', 'edited_message'],
      })

      state.lastPolledAt = Date.now()

      if (!Array.isArray(updates) || updates.length === 0) {
        return
      }

      const lastOffset = updates[updates.length - 1]?.update_id
      if (typeof lastOffset === 'number') {
        state.offset = lastOffset + 1
        this.updateOffsets[bot.id] = state.offset
        this.saveUpdateOffsets()
      }

      for (const update of updates) {
        if (this.shouldSkipBacklog(hadStoredOffset, update)) {
          appLog('debug', `Skipping stale Telegram update ${update.update_id} for "${bot.name}"`, 'telegram')
          continue
        }
        await this.handleUpdate(bot, update)
      }
      state.lastError = ''
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.lastError = message
      state.commandsSynced = false
      appLog('warn', `Telegram bot "${bot.name}" polling failed: ${message}`, 'telegram')
    }
  }

  private async syncTelegramMenu(bot: TelegramBotRecord): Promise<void> {
    const token = bot.credentials.bot_token?.trim()
    if (!token) return

    await this.callTelegramApi(token, 'setMyCommands', {
      commands: TELEGRAM_COMMAND_DEFINITIONS,
    })

    await this.callTelegramApi(token, 'setChatMenuButton', {
      menu_button: {
        type: 'commands',
      },
    })
  }

  private shouldSkipBacklog(hasStoredOffset: boolean, update: TelegramUpdate): boolean {
    if (hasStoredOffset) {
      return false
    }

    const message = update.message || update.edited_message
    const date = Number(message?.date || 0) * 1000
    if (!date) {
      return true
    }

    return date < this.runtimeStartedAt - STARTUP_BACKLOG_GRACE_MS
  }

  private async callTelegramApi<TResult>(
    token: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const json = await response.json().catch(() => ({})) as { ok?: boolean; result?: TResult; description?: string }
      if (!response.ok || !json?.ok) {
        throw new Error(json?.description || `Telegram API ${response.status}`)
      }
      return json.result as TResult
    } finally {
      clearTimeout(timer)
    }
  }

  private async sendTelegramMessage(
    token: string,
    chatId: string,
    text: string,
    replyToMessageId?: number,
    replyMarkup?: TelegramReplyMarkup,
  ): Promise<number[]> {
    const trimmed = text.trim()
    if (!trimmed) return []

    const chunks = this.chunkTelegramText(trimmed)
    return this.sendTelegramChunks(token, chatId, chunks, replyToMessageId, replyMarkup)
  }

  private async sendTelegramChunks(
    token: string,
    chatId: string,
    chunks: string[],
    replyToMessageId?: number,
    replyMarkup?: TelegramReplyMarkup,
  ): Promise<number[]> {
    const messageIds: number[] = []
    for (let index = 0; index < chunks.length; index += 1) {
      const result = await this.callTelegramApi<TelegramSentMessage>(token, 'sendMessage', {
        chat_id: chatId,
        text: chunks[index],
        parse_mode: 'HTML',
        reply_to_message_id: index === 0 ? replyToMessageId : undefined,
        reply_markup: index === 0 ? (replyMarkup || TELEGRAM_MENU_KEYBOARD) : undefined,
      })
      if (typeof result?.message_id === 'number') {
        messageIds.push(result.message_id)
      }
    }
    return messageIds
  }

  private async editTelegramMessage(
    token: string,
    chatId: string,
    messageId: number,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return

    await this.callTelegramApi(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: trimmed,
      parse_mode: 'HTML',
    })
  }

  private async resolveTelegramFile(
    token: string,
    fileId: string,
  ): Promise<TelegramApiFile> {
    return this.callTelegramApi<TelegramApiFile>(token, 'getFile', {
      file_id: fileId,
    })
  }

  private async downloadTelegramFile(
    token: string,
    filePath: string,
    apiBase?: string,
  ): Promise<Buffer> {
    const normalizedApiBase = normalizeTelegramApiBase(apiBase)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`${normalizedApiBase}/file/bot${token}/${filePath}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Telegram file download failed: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } finally {
      clearTimeout(timer)
    }
  }

  private getMessageText(message: TelegramMessage): string {
    return String(message.text || message.caption || '').trim()
  }

  private getMessageFileId(message: TelegramMessage): string {
    return message.voice?.file_id?.trim()
      || message.audio?.file_id?.trim()
      || message.document?.file_id?.trim()
      || ''
  }

  private async resolveTelegramImageInput(
    bot: TelegramBotRecord,
    message: TelegramMessage,
  ): Promise<{ data: string; mimeType: string }[]> {
    const token = bot.credentials.bot_token?.trim()
    if (!token) return []

    const fileId = resolvePreferredPhotoFileId(message)
      || (
        String(message.document?.mime_type || '').startsWith('image/')
          ? String(message.document?.file_id || '').trim()
          : ''
      )
    if (!fileId) return []

    const file = await this.resolveTelegramFile(token, fileId)
    if (!file.file_path) {
      throw new Error('Telegram 图片文件缺少 file_path')
    }

    const buffer = await this.downloadTelegramFile(token, file.file_path)
    const mimeType = String(message.document?.mime_type || '').trim()
      || inferMimeTypeFromFileName(file.file_path, 'image/jpeg')

    return [{
      data: buffer.toString('base64'),
      mimeType,
    }]
  }

  private async resolveTelegramAudioInput(
    bot: TelegramBotRecord,
    message: TelegramMessage,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const token = bot.credentials.bot_token?.trim()
    if (!token) {
      throw new Error('Telegram bot token 未配置')
    }

    const fileId = this.getMessageFileId(message)
    if (!fileId) {
      throw new Error('未找到可下载的音频 file_id')
    }

    const file = await this.resolveTelegramFile(token, fileId)
    if (!file.file_path) {
      throw new Error('Telegram 音频文件缺少 file_path')
    }

    const buffer = await this.downloadTelegramFile(token, file.file_path)
    const fileName = message.audio?.file_name
      || message.document?.file_name
      || path.basename(file.file_path)
      || 'telegram-audio.ogg'
    const mimeType = String(message.voice?.mime_type || message.audio?.mime_type || message.document?.mime_type || '').trim()
      || inferMimeTypeFromFileName(fileName, 'audio/ogg')

    return { buffer, mimeType, fileName }
  }

  private resolveProviderTranscriptionCandidate(bot: TelegramBotRecord): TelegramTranscriptionProvider | null {
    const providerId = this.getSuggestedProviderId(bot)
    if (!providerId) return null

    const provider = this.providerService.getById(providerId) as DesktopAIProvider | null
    if (!provider) return null

    const env = parseEnvOverrides(provider.envOverrides || '')
    const apiKey = String(env.OPENAI_API_KEY || '').trim()
    const apiEndpoint = String(env.OPENAI_BASE_URL || env.OPENAI_BASEURL || 'https://api.openai.com/v1').trim()
    const model = String(env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1').trim()

    if (!apiEndpoint || !model || !apiKey) {
      return null
    }

    return {
      apiEndpoint,
      apiKey,
      model,
      source: `provider:${provider.name}`,
    }
  }

  private resolveTelegramAiTranscriptionCandidate(): TelegramTranscriptionProvider | null {
    const provider = [...this.aiProviders]
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))
      .find(candidate => candidate.apiEndpoint?.trim() && candidate.model?.trim())

    if (!provider?.apiEndpoint?.trim() || !provider.model?.trim()) {
      return null
    }

    return {
      apiEndpoint: provider.apiEndpoint.trim(),
      apiKey: String(provider.apiKey || '').trim(),
      model: provider.model.trim(),
      source: `telegram-ai:${provider.name}`,
    }
  }

  private async transcribeTelegramAudio(
    bot: TelegramBotRecord,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const provider = this.resolveProviderTranscriptionCandidate(bot)
      || this.resolveTelegramAiTranscriptionCandidate()
    if (!provider) {
      throw new Error('未配置可用的语音转写提供商')
    }

    const endpoint = normalizeTranscriptionEndpoint(provider.apiEndpoint)
    const form = new FormData()
    const audioBytes = Uint8Array.from(buffer)
    form.set('file', new Blob([audioBytes], { type: mimeType || 'audio/ogg' }), fileName || 'telegram-audio.ogg')
    form.set('model', provider.model)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : undefined,
        body: form,
        signal: controller.signal,
      })
      const json = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string } | string }
      if (!response.ok) {
        const message = typeof json.error === 'string'
          ? json.error
          : json.error?.message
        throw new Error(message || `转写请求失败: ${response.status}`)
      }

      const transcript = String(json.text || '').trim()
      if (!transcript) {
        throw new Error(`转写接口 ${provider.source} 未返回文本结果`)
      }
      return transcript
    } finally {
      clearTimeout(timer)
    }
  }

  private chunkTelegramText(text: string): string[] {
    if (text.length <= MAX_TELEGRAM_MESSAGE_LEN) return [text]
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > MAX_TELEGRAM_MESSAGE_LEN) {
      let splitAt = remaining.lastIndexOf('\n', MAX_TELEGRAM_MESSAGE_LEN)
      if (splitAt < 0 || splitAt < MAX_TELEGRAM_MESSAGE_LEN / 2) {
        splitAt = MAX_TELEGRAM_MESSAGE_LEN
      }
      chunks.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt).trimStart()
    }
    if (remaining) chunks.push(remaining)
    return chunks
  }

  private isAuthorized(bot: TelegramBotRecord, chatId: string, userId: string): boolean {
    const configuredChatId = stringifyId(bot.credentials.chat_id)
    if (configuredChatId) {
      return configuredChatId === chatId
    }

    if (this.allowedUsers.length > 0) {
      return this.allowedUsers.some(user => stringifyId(user.userId) === userId)
    }

    return false
  }

  private async handleUpdate(bot: TelegramBotRecord, update: TelegramUpdate): Promise<void> {
    const message = update.message || update.edited_message
    const token = bot.credentials.bot_token?.trim()
    if (!message || !token) return

    const chatId = stringifyId(message.chat?.id)
    const userId = stringifyId(message.from?.id)
    const normalizedText = this.normalizeTelegramMenuCommand(this.getMessageText(message))
    if (!chatId || !userId) return

    if (!this.isAuthorized(bot, chatId, userId)) {
      return
    }

    if (normalizedText.startsWith('/') && !hasImagePayload(message) && !hasAudioPayload(message)) {
      const handled = await this.handleCommand(bot, chatId, normalizedText, message.message_id)
      if (handled) return
    }

    if (hasImagePayload(message)) {
      await this.forwardImageToSession(bot, chatId, message, message.message_id)
      return
    }

    if (hasAudioPayload(message)) {
      await this.forwardAudioToSession(bot, chatId, message, message.message_id)
      return
    }

    if (normalizedText) {
      await this.forwardTextToSession(bot, chatId, normalizedText, message.message_id)
    }
  }

  private normalizeTelegramMenuCommand(rawText: string): string {
    const trimmed = rawText.trim()
    if (!trimmed) return ''

    for (const alias of TELEGRAM_COMMAND_ALIASES) {
      const match = trimmed.match(alias.pattern)
      if (match) {
        return alias.resolver(match)
      }
    }

    return trimmed
  }

  private async handleCommand(
    bot: TelegramBotRecord,
    chatId: string,
    rawText: string,
    replyToMessageId?: number,
  ): Promise<boolean> {
    const [commandToken, ...rest] = rawText.split(/\s+/)
    const command = commandToken.split('@')[0].toLowerCase()
    const args = rest.join(' ').trim()

    switch (command) {
      case '/start':
      case '/help':
        await this.sendTelegramMessage(bot.credentials.bot_token!.trim(), chatId, this.renderHelpText(bot, chatId), replyToMessageId)
        return true
      case '/sessions':
        await this.sendTelegramMessage(bot.credentials.bot_token!.trim(), chatId, this.renderSessionsText(), replyToMessageId)
        return true
      case '/dock_telegram': {
        const session = this.resolveSessionSelection(args)
        if (!session) {
          await this.sendTelegramMessage(
            bot.credentials.bot_token!.trim(),
            chatId,
            '未找到可绑定的会话。先在桌面端创建会话，或发送 /sessions 查看可用列表。',
            replyToMessageId,
          )
          return true
        }
        this.bindSession(bot.id, chatId, session.id)
        await this.sendTelegramMessage(
          bot.credentials.bot_token!.trim(),
          chatId,
          `已绑定到会话 <b>${escHtml(session.name || shortenSessionId(session.id))}</b>\nID: <code>${escHtml(session.id)}</code>\n状态: ${escHtml(sessionStatusLabel(session.status))}\n\n现在直接发送文本，就会转发到这个会话。`,
          replyToMessageId,
        )
        return true
      }
      case '/undock':
        this.unbindSession(bot.id, chatId)
        await this.sendTelegramMessage(bot.credentials.bot_token!.trim(), chatId, '已解除当前聊天和 ABF 会话的绑定。', replyToMessageId)
        return true
      case '/status': {
        const boundSessionId = this.getBoundSessionId(bot.id, chatId)
        const boundSession = boundSessionId ? this.sessionService.getById(boundSessionId) : null
        const runtime = this.runtimeStates.get(bot.id)
        const text = [
          `<b>${escHtml(bot.name)}</b>`,
          `运行状态: ${this.running ? '运行中' : '已停止'}`,
          `最近轮询: ${runtime?.lastPolledAt ? new Date(runtime.lastPolledAt).toLocaleString('zh-CN') : '暂无'}`,
          `当前绑定: ${boundSession ? `${escHtml(boundSession.name)} (${escHtml(shortenSessionId(boundSession.id))})` : '未绑定'}`,
        ].join('\n')
        await this.sendTelegramMessage(bot.credentials.bot_token!.trim(), chatId, text, replyToMessageId)
        return true
      }
      case '/stop': {
        const boundSessionId = this.getBoundSessionId(bot.id, chatId)
        const boundSession = boundSessionId ? this.sessionService.getById(boundSessionId) : null
        if (!boundSessionId || !boundSession) {
          await this.sendTelegramMessage(
            bot.credentials.bot_token!.trim(),
            chatId,
            '当前聊天还没绑定可停止的会话。先发 /dock_telegram，或者 /sessions 看列表。',
            replyToMessageId,
          )
          return true
        }
        await this.processService.stopProcess(boundSessionId)
        await this.sendTelegramMessage(
          bot.credentials.bot_token!.trim(),
          chatId,
          `已停止会话 <b>${escHtml(boundSession.name || shortenSessionId(boundSession.id))}</b> 的当前输出。`,
          replyToMessageId,
        )
        return true
      }
      default:
        return false
    }
  }

  private renderHelpText(bot: TelegramBotRecord, chatId: string): string {
    const boundSessionId = this.getBoundSessionId(bot.id, chatId)
    const boundSession = boundSessionId ? this.sessionService.getById(boundSessionId) : null
    return [
      '<b>AllBeingsFuture Telegram 控制</b>',
      '',
      '可用命令：',
      '• /help 查看帮助',
      '• /sessions 查看最近会话',
      '• /dock_telegram [序号|会话 ID|会话名] 绑定当前聊天到会话',
      '• /undock 解除绑定',
      '• /status 查看当前绑定和运行状态',
      '• /stop 停止当前会话输出',
      '• 也可以直接点底部中文菜单按钮：帮助 / 会话列表 / 绑定会话 / 解除绑定 / 状态 / 停止',
      '',
      boundSession
        ? `当前已绑定：<b>${escHtml(boundSession.name || shortenSessionId(boundSession.id))}</b>`
        : '当前未绑定会话。先发 /dock_telegram 或 /sessions。',
      '',
      '绑定后，直接发送文本、图片都会转发到 ABF 当前会话；语音会先尝试转写再转发。',
      '当会话正在输出时，Telegram 会尽量用同一条消息做流式更新预览。',
      'Telegram 的斜杠命令名仍保留英文，这是官方限制；中文菜单和中文别名都已可直接使用。',
      '未识别的 /xxx 指令也会在已绑定时原样转发给会话。',
    ].join('\n')
  }

  private renderSessionsText(): string {
    const sessions = this.listCandidateSessions().slice(0, 8)
    if (sessions.length === 0) {
      return '当前没有可用会话。先在桌面端创建一个，再回来发送 /dock_telegram。'
    }

    const lines = ['<b>最近会话</b>', '']
    for (const [index, session] of sessions.entries()) {
      lines.push(
        `${index + 1}. <b>${escHtml(session.name || '未命名会话')}</b>`,
        `   ID: <code>${escHtml(shortenSessionId(session.id))}</code> · ${escHtml(sessionStatusLabel(session.status))}`,
      )
    }
    lines.push('', '发送 /dock_telegram 1 或 /dock_telegram 会话名 来绑定。')
    return lines.join('\n')
  }

  private listCandidateSessions(): Session[] {
    return this.sessionService.getAll().filter(session => !session.parentSessionId)
  }

  private resolveSessionSelection(selector: string): Session | null {
    const sessions = this.listCandidateSessions()
    if (sessions.length === 0) return null

    const normalized = selector.trim()
    if (!normalized) {
      return sessions.find(session => session.status === 'running')
        || sessions.find(session => session.status === 'idle')
        || sessions[0]
    }

    if (/^\d+$/.test(normalized)) {
      const index = Number(normalized) - 1
      if (index >= 0 && index < sessions.length) {
        return sessions[index]
      }
    }

    const lower = normalized.toLowerCase()
    return sessions.find(session => session.id === normalized)
      || sessions.find(session => session.id.toLowerCase().startsWith(lower))
      || sessions.find(session => (session.name || '').toLowerCase() === lower)
      || sessions.find(session => (session.name || '').toLowerCase().includes(lower))
      || null
  }

  private async resolveBoundSessionContext(
    bot: TelegramBotRecord,
    chatId: string,
    replyToMessageId?: number,
  ): Promise<{ token: string; session: Session; sessionId: string } | null> {
    const token = bot.credentials.bot_token?.trim()
    if (!token) return null

    const boundSessionId = this.getBoundSessionId(bot.id, chatId)
    if (!boundSessionId) {
      await this.sendTelegramMessage(
        token,
        chatId,
        '当前聊天还没绑定 ABF 会话。先发 /dock_telegram，或者 /sessions 看列表。',
        replyToMessageId,
      )
      return null
    }

    const session = this.sessionService.getById(boundSessionId)
    if (!session) {
      this.unbindSession(bot.id, chatId)
      await this.sendTelegramMessage(
        token,
        chatId,
        '绑定的会话已经不存在，已自动解除绑定。请重新发送 /dock_telegram 绑定新的会话。',
        replyToMessageId,
      )
      return null
    }

    return { token, session, sessionId: boundSessionId }
  }

  private async forwardTextToSession(
    bot: TelegramBotRecord,
    chatId: string,
    text: string,
    replyToMessageId?: number,
  ): Promise<void> {
    await this.forwardSessionRequest(bot, chatId, replyToMessageId, (sessionId) =>
      this.processService.sendMessage(sessionId, text),
    )
  }

  private async forwardImageToSession(
    bot: TelegramBotRecord,
    chatId: string,
    message: TelegramMessage,
    replyToMessageId?: number,
  ): Promise<void> {
    let images: Array<{ data: string; mimeType: string }> = []
    try {
      images = await this.resolveTelegramImageInput(bot, message)
    } catch (error) {
      const token = bot.credentials.bot_token?.trim()
      if (token) {
        await this.sendTelegramMessage(
          token,
          chatId,
          `收到图片了，但下载图片内容失败：${escHtml(error instanceof Error ? error.message : String(error))}`,
          replyToMessageId,
        )
      }
      return
    }

    if (images.length === 0) {
      const token = bot.credentials.bot_token?.trim()
      if (token) {
        await this.sendTelegramMessage(
          token,
          chatId,
          '收到图片了，但下载图片内容失败。请稍后重试，或改用文件/文字补充说明。',
          replyToMessageId,
        )
      }
      return
    }

    const prompt = this.getMessageText(message)
      || '[Telegram 图片消息]\n用户发送了一张图片，请结合图片内容继续回复。'

    await this.forwardSessionRequest(bot, chatId, replyToMessageId, (sessionId) =>
      this.processService.sendMessageWithImages(sessionId, prompt, images),
    )
  }

  private async forwardAudioToSession(
    bot: TelegramBotRecord,
    chatId: string,
    message: TelegramMessage,
    replyToMessageId?: number,
  ): Promise<void> {
    let audio: { buffer: Buffer; mimeType: string; fileName: string }
    try {
      audio = await this.resolveTelegramAudioInput(bot, message)
    } catch (error) {
      const token = bot.credentials.bot_token?.trim()
      if (token) {
        await this.sendTelegramMessage(
          token,
          chatId,
          `收到语音了，但下载语音内容失败：${escHtml(error instanceof Error ? error.message : String(error))}`,
          replyToMessageId,
        )
      }
      return
    }
    const promptLines = ['[Telegram 语音消息]']

    const extraText = this.getMessageText(message)
    if (extraText) {
      promptLines.push(`附加文本：${extraText}`)
    }

    try {
      const transcript = await this.transcribeTelegramAudio(bot, audio.buffer, audio.fileName, audio.mimeType)
      promptLines.push(`语音转写：${transcript}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      appLog('warn', `Telegram audio transcription failed: ${errorMessage}`, 'telegram')
      promptLines.push('系统未能取得这段语音的转写文本。请结合上下文回复，并提醒用户必要时改发文字。')
      promptLines.push(`系统备注：${errorMessage}`)
    }

    await this.forwardSessionRequest(bot, chatId, replyToMessageId, (sessionId) =>
      this.processService.sendMessage(sessionId, promptLines.join('\n')),
    )
  }

  private async forwardSessionRequest(
    bot: TelegramBotRecord,
    chatId: string,
    replyToMessageId: number | undefined,
    dispatch: (sessionId: string) => Promise<void>,
  ): Promise<void> {
    const context = await this.resolveBoundSessionContext(bot, chatId, replyToMessageId)
    if (!context) return

    const { token, session, sessionId } = context
    const baseline = this.processService.getChatState(sessionId)?.messages.length ?? 0
    const wasStreaming = this.processService.isStreaming(sessionId)

    try {
      await dispatch(sessionId)

      if (wasStreaming) {
        await this.sendTelegramMessage(
          token,
          chatId,
          `会话 <b>${escHtml(session.name || shortenSessionId(session.id))}</b> 正在忙，这条消息已经排队。`,
          replyToMessageId,
        )
      }

      const result = await this.waitForAssistantReply(sessionId, baseline, {
        token,
        chatId,
        replyToMessageId,
      })
      if (!result.reply) {
        await this.sendTelegramMessage(
          token,
          chatId,
          `消息已发送到 <b>${escHtml(session.name || shortenSessionId(session.id))}</b>，但在等待窗口内没有拿到新的回复。`,
          replyToMessageId,
        )
        return
      }

      await this.deliverTelegramAssistantReply(
        token,
        chatId,
        result.reply,
        replyToMessageId,
        result.previewMessageId,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.sendTelegramMessage(
        token,
        chatId,
        `发送到会话失败：${escHtml(message)}`,
        replyToMessageId,
      )
    }
  }

  private async deliverTelegramAssistantReply(
    token: string,
    chatId: string,
    reply: string,
    replyToMessageId?: number,
    previewMessageId?: number,
  ): Promise<void> {
    const chunks = this.chunkTelegramText(reply)
    if (chunks.length === 0) return

    if (previewMessageId) {
      try {
        await this.editTelegramMessage(token, chatId, previewMessageId, chunks[0])
        if (chunks.length > 1) {
          await this.sendTelegramChunks(token, chatId, chunks.slice(1))
        }
        return
      } catch (error) {
        appLog('warn', `Telegram preview finalization failed: ${String(error)}`, 'telegram')
      }
    }

    await this.sendTelegramChunks(token, chatId, chunks, replyToMessageId)
  }

  private async waitForAssistantReply(
    sessionId: string,
    baselineMessageCount: number,
    previewTarget?: { token: string; chatId: string; replyToMessageId?: number },
  ): Promise<{ reply: string; previewMessageId?: number }> {
    const timeoutMs = 180_000
    const startedAt = Date.now()
    let lastStateError = ''
    let previewMessageId: number | undefined
    let lastPreviewText = ''
    let lastPreviewAt = 0

    while (Date.now() - startedAt < timeoutMs) {
      const state = this.processService.getChatState(sessionId)
      const messages = state?.messages ?? []
      const assistantMessages = messages
        .slice(baselineMessageCount)
        .filter((message): message is ChatMessage => message.role === 'assistant' && Boolean(message.content?.trim()))
      const reply = assistantMessages.length > 0
        ? this.formatAssistantMessages(assistantMessages)
        : ''

      if (state?.error) {
        lastStateError = state.error
      }

      if (
        previewTarget
        && state?.streaming
        && reply
      ) {
        const previewText = buildStreamPreviewText(reply)
        if (
          previewText !== lastPreviewText
          && (!previewMessageId || (Date.now() - lastPreviewAt) >= STREAM_PREVIEW_UPDATE_INTERVAL_MS)
        ) {
          if (!previewMessageId) {
            const ids = await this.sendTelegramMessage(
              previewTarget.token,
              previewTarget.chatId,
              previewText,
              previewTarget.replyToMessageId,
            )
            previewMessageId = ids[0]
          } else {
            await this.editTelegramMessage(
              previewTarget.token,
              previewTarget.chatId,
              previewMessageId,
              previewText,
            )
          }
          lastPreviewText = previewText
          lastPreviewAt = Date.now()
        }
      }

      if (!state?.streaming) {
        if (reply) {
          return { reply, previewMessageId }
        }
        if (lastStateError) {
          throw new Error(lastStateError)
        }
      }

      await sleep(800)
    }

    return { reply: '', previewMessageId }
  }

  private formatAssistantMessages(messages: ChatMessage[]): string {
    const texts = messages
      .map(message => message.content.trim())
      .filter(Boolean)

    if (texts.length === 0) return ''

    const joined = texts.join('\n\n')
    return escHtml(joined)
  }

  start(): { success: boolean } {
    if (this.running) return { success: true }
    this.running = true
    this.runtimeStartedAt = Date.now()
    this.scheduleNextPoll(0)
    appLog('info', `Telegram runtime started with ${this.getEnabledTelegramBots().length} enabled bot(s)`, 'telegram')
    return { success: true }
  }

  stop(): { success: boolean } {
    this.running = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.polling = false
    appLog('info', 'Telegram runtime stopped', 'telegram')
    return { success: true }
  }

  reload(): { success: boolean } {
    this.loadConfig()
    this.loadChatBindings()
    return { success: true }
  }

  restart(): { success: boolean; error?: string } {
    try {
      this.stop()
      this.loadConfig()
      this.loadChatBindings()
      this.start()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  status(): { running: boolean; config: TelegramConfig; activeBots: number; trackedChats: number } {
    return {
      running: this.running,
      config: this.getConfig(),
      activeBots: this.getEnabledTelegramBots().length,
      trackedChats: Object.keys(this.chatBindings).length,
    }
  }

  getConfig(): TelegramConfig { return { ...this.config } }

  updateConfig(key: string, value: any): void {
    (this.config as any)[key] = value
    this.saveConfig()
  }

  getAllowedUsers(): AllowedUser[] { return [...this.allowedUsers] }

  addAllowedUser(userId: string, username: string, role: string): { success: boolean } {
    if (!this.allowedUsers.find(u => u.userId === userId)) {
      this.allowedUsers.push({ userId, username, role })
      this.saveConfig()
    }
    return { success: true }
  }

  removeAllowedUser(userId: string): { success: boolean } {
    this.allowedUsers = this.allowedUsers.filter(u => u.userId !== userId)
    this.saveConfig()
    return { success: true }
  }

  getAIProviders(): AIProvider[] { return [...this.aiProviders] }

  addAIProvider(
    idOrName: string,
    nameMaybe?: string,
    apiEndpointMaybe?: string,
    apiKeyMaybe?: string,
    modelMaybe?: string,
    maxTokensMaybe?: number,
    priorityMaybe?: number,
  ): { success: boolean; provider: AIProvider } {
    const provider: AIProvider = {
      id: idOrName || `tg-ai-${Date.now()}`,
      name: nameMaybe || idOrName || `Telegram AI ${this.aiProviders.length + 1}`,
      apiEndpoint: apiEndpointMaybe || '',
      apiKey: apiKeyMaybe || '',
      model: modelMaybe || '',
      maxTokens: maxTokensMaybe || 4096,
      priority: priorityMaybe || 0,
    }
    this.aiProviders.push(provider)
    this.saveConfig()
    return { success: true, provider }
  }

  updateAIProvider(id: string, updates: string | Partial<AIProvider>): { success: boolean; error?: string } {
    const payload = typeof updates === 'string'
      ? JSON.parse(updates || '{}') as Partial<AIProvider>
      : updates
    const index = this.aiProviders.findIndex(provider => provider.id === id)
    if (index < 0) {
      return { success: false, error: 'AI Provider 不存在' }
    }
    this.aiProviders[index] = { ...this.aiProviders[index], ...payload }
    this.saveConfig()
    return { success: true }
  }

  deleteAIProvider(id: string): { success: boolean } {
    this.aiProviders = this.aiProviders.filter(provider => provider.id !== id)
    this.saveConfig()
    return { success: true }
  }

  getBotBindings(): ChatBindings {
    return { ...this.chatBindings }
  }

  getSuggestedProviderId(bot: TelegramBotRecord): string {
    const requested = (bot.agent_profile_id || '').trim()
    if (requested) {
      const provider = this.providerService.getById(requested)
      if (provider && this.providerService.isRunnable(provider)) {
        return provider.id
      }
    }

    return this.providerService.getRunnable()[0]?.id || ''
  }
}
