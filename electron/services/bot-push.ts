/**
 * BotPushService - Push notifications to IM bots
 *
 * Currently supports: Telegram
 * Future: 飞书, 钉钉, 企业微信, OneBot, QQ 官方
 */

import type { BotService } from './bot.js'

export class BotPushService {
  constructor(private botService: BotService) {}

  /**
   * Push a notification message to all enabled bots.
   * Errors per-bot are caught and logged so one failure never blocks others.
   */
  async push(title: string, body: string): Promise<void> {
    const bots = this.botService.list()
    console.log(`[BotPushService] push() called — ${bots.length} bot(s) registered`)
    let pushed = 0
    for (const bot of bots) {
      if (!bot.enabled) {
        console.log(`[BotPushService] Skipping "${bot.name}" (disabled)`)
        continue
      }
      try {
        const credentials: Record<string, string> = bot.credentials ?? {}
        console.log(`[BotPushService] Pushing to "${bot.name}" (${bot.type}), has token: ${!!credentials.bot_token}, has chat_id: ${!!credentials.chat_id}`)
        switch (bot.type) {
          case 'telegram':
            await this.pushTelegram(credentials, title, body)
            pushed++
            break
          default:
            console.log(`[BotPushService] Unknown bot type "${bot.type}", skipping`)
        }
      } catch (err: any) {
        console.error(`[BotPushService] Failed to push to bot "${bot.name}" (${bot.type}):`, err?.message ?? err)
      }
    }
    console.log(`[BotPushService] push() done — ${pushed} bot(s) notified`)
  }

  /**
   * Send a test push to a single bot and return the result.
   */
  async testPush(botId: string): Promise<{ ok: boolean; error?: string }> {
    const bots = this.botService.list()
    const bot = bots.find((b: any) => b.id === botId)
    if (!bot) return { ok: false, error: 'Bot not found' }

    try {
      const credentials: Record<string, string> = bot.credentials ?? {}
      switch (bot.type) {
        case 'telegram': {
          if (!credentials.bot_token?.trim())
            return { ok: false, error: '缺少 Bot Token，请先编辑 Bot 填写凭证' }
          if (!credentials.chat_id?.trim())
            return { ok: false, error: '缺少推送 Chat ID，请先编辑 Bot 填写 Chat ID' }
          await this.pushTelegram(credentials, '🔔 AllBeingsFuture', '测试推送成功！Bot 推送功能正常。')
          break
        }
        default:
          return { ok: false, error: `暂不支持该平台的推送: ${bot.type}` }
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  }

  // ─── Platform implementations ─────────────────────────────────────────────

  private async pushTelegram(
    credentials: Record<string, string>,
    title: string,
    body: string,
  ): Promise<void> {
    const token = credentials.bot_token?.trim()
    const chatId = credentials.chat_id?.trim()
    if (!token || !chatId) return   // not configured — skip silently

    // Telegram message limit is 4096 chars; truncate body to fit
    const MAX_BODY_LEN = 3800
    const truncatedBody = body.length > MAX_BODY_LEN
      ? body.slice(0, MAX_BODY_LEN) + '\n\n…(内容已截断)'
      : body
    const text = `<b>${esc(title)}</b>\n\n${esc(truncatedBody)}`
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as any
        throw new Error(`Telegram API ${res.status}: ${e?.description ?? res.statusText}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
