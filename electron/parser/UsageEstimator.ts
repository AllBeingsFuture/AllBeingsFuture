/**
 * Token 用量估算器 - 支持按会话/按日累计
 */

import type { UsageSummary } from './types.js'

/** 数据库持久化接口（适配 AllBeingsFuture 的 Database） */
export interface UsageDatabase {
  saveUsageStat(sessionId: string, date: string, tokens: number, minutes: number): void
}

/**
 * Token 用量估算器
 * 基于字符数估算 Token 消耗，支持持久化到数据库
 */
export class UsageEstimator {
  /** 每个会话的累计 Token 用量 */
  private sessionUsage: Map<string, number> = new Map()
  /** 每个会话的活跃开始时间 */
  private sessionStartTime: Map<string, number> = new Map()
  /** 每个会话的累计活跃分钟数 */
  private sessionMinutes: Map<string, number> = new Map()
  /** 数据库引用 */
  private database: UsageDatabase | null = null
  /** 定时 flush 定时器 */
  private flushTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 绑定数据库并启动定时 flush
   */
  bindDatabase(database: UsageDatabase): void {
    this.database = database
    this.flushTimer = setInterval(() => this.flushToDb(), 60_000)
  }

  /**
   * 估算文本的 Token 数量
   */
  estimateTokens(text: string): number {
    let asciiChars = 0
    let nonAsciiChars = 0

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code <= 127) {
        asciiChars++
      } else {
        nonAsciiChars++
      }
    }

    return Math.ceil(asciiChars / 4 + nonAsciiChars / 2)
  }

  /**
   * 累加会话的 Token 用量
   */
  accumulateUsage(sessionId: string, text: string): void {
    const tokens = this.estimateTokens(text)
    const currentUsage = this.sessionUsage.get(sessionId) || 0
    this.sessionUsage.set(sessionId, currentUsage + tokens)

    if (!this.sessionStartTime.has(sessionId)) {
      this.sessionStartTime.set(sessionId, Date.now())
    }
  }

  /**
   * 标记会话结束
   */
  markSessionEnded(sessionId: string): void {
    this.updateSessionMinutes(sessionId)
    this.flushSessionToDb(sessionId)
    this.sessionStartTime.delete(sessionId)
  }

  private updateSessionMinutes(sessionId: string): void {
    const startTime = this.sessionStartTime.get(sessionId)
    if (!startTime) return
    const elapsedMs = Date.now() - startTime
    const minutes = Math.round(elapsedMs / 60_000)
    this.sessionMinutes.set(sessionId, minutes)
  }

  /**
   * 获取用量汇总
   */
  getSummary(): UsageSummary {
    let totalTokens = 0
    let totalMinutes = 0
    const sessionBreakdown: Record<string, number> = {}

    for (const [sessionId, tokens] of this.sessionUsage.entries()) {
      totalTokens += tokens
      sessionBreakdown[sessionId] = tokens
    }

    for (const sessionId of this.sessionStartTime.keys()) {
      this.updateSessionMinutes(sessionId)
    }

    for (const minutes of this.sessionMinutes.values()) {
      totalMinutes += minutes
    }

    return {
      totalTokens,
      totalMinutes,
      todayTokens: totalTokens,   // NOTE: tracks current app session, not calendar day
      todayMinutes: totalMinutes, // NOTE: tracks current app session, not calendar day
      activeSessions: this.sessionStartTime.size,
      sessionBreakdown
    }
  }

  getSessionUsage(sessionId: string): number {
    return this.sessionUsage.get(sessionId) || 0
  }

  resetSessionUsage(sessionId: string): void {
    this.sessionUsage.delete(sessionId)
    this.sessionStartTime.delete(sessionId)
    this.sessionMinutes.delete(sessionId)
  }

  resetAll(): void {
    this.sessionUsage.clear()
    this.sessionStartTime.clear()
    this.sessionMinutes.clear()
  }

  private flushSessionToDb(sessionId: string): void {
    if (!this.database) return
    const tokens = this.sessionUsage.get(sessionId) || 0
    if (tokens === 0) return

    this.updateSessionMinutes(sessionId)
    const minutes = this.sessionMinutes.get(sessionId) || 0
    const today = new Date().toISOString().slice(0, 10)

    this.database.saveUsageStat(sessionId, today, tokens, minutes)
  }

  flushToDb(): void {
    if (!this.database) return
    for (const sessionId of this.sessionUsage.keys()) {
      this.flushSessionToDb(sessionId)
    }
  }

  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flushToDb()
  }
}
