/**
 * UsageService - Token usage analytics and statistics
 *
 * Aggregates token consumption data from session messages,
 * providing summary, daily trends, and per-session breakdowns.
 */

import type { Database } from './database.js'

interface UsageSummary {
  todayTokens: number
  todayMinutes: number
  totalTokens: number
  totalMinutes: number
  activeSessions: number
}

interface DailyStat {
  date: string
  inputTokens: number
  outputTokens: number
  tokens: number
  minutes: number
  sessions: number
}

interface SessionUsageStat {
  sessionId: string
  sessionName: string
  tokens: number
  minutes: number
}

interface UsageHistory {
  dailyStats: DailyStat[]
  sessionStats: SessionUsageStat[]
}

interface MessageUsage {
  inputTokens?: number
  outputTokens?: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}

interface StoredMessage {
  role?: string
  content?: string
  usage?: MessageUsage
  timestamp?: string
}

export class UsageService {
  constructor(private db: Database) {}

  /**
   * Get aggregated usage summary (today + total)
   */
  getSummary(): UsageSummary {
    const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const sessions = this.db.raw.prepare(
      'SELECT id, name, status, started_at, ended_at, messages_json FROM sessions'
    ).all() as any[]

    let totalTokens = 0
    let todayTokens = 0
    let totalMinutes = 0
    let todayMinutes = 0
    let activeSessions = 0

    for (const session of sessions) {
      const { input, output } = this.extractTokensFromMessages(session.messages_json)
      const sessionTokens = input + output
      totalTokens += sessionTokens

      // Calculate session duration in minutes
      const startedAt = session.started_at ? new Date(session.started_at) : null
      const endedAt = session.ended_at ? new Date(session.ended_at) : null
      if (startedAt) {
        const end = endedAt || new Date()
        const mins = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60000))
        totalMinutes += mins

        // Check if session is from today
        const sessionDate = session.started_at?.slice(0, 10)
        if (sessionDate === todayStr) {
          todayTokens += sessionTokens
          todayMinutes += mins
        }
      }

      // Count active sessions
      if (['running', 'starting', 'idle', 'waiting_input'].includes(session.status)) {
        activeSessions++
      }
    }

    return { todayTokens, todayMinutes, totalTokens, totalMinutes, activeSessions }
  }

  /**
   * Get usage history for the given number of days
   */
  getHistory(days: number = 30): UsageHistory {
    const sessions = this.db.raw.prepare(
      'SELECT id, name, started_at, ended_at, messages_json FROM sessions ORDER BY started_at DESC'
    ).all() as any[]

    // Calculate date range
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days + 1)
    startDate.setHours(0, 0, 0, 0)

    // Initialize daily buckets
    const dailyMap = new Map<string, DailyStat>()
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      dailyMap.set(dateStr, {
        date: dateStr,
        inputTokens: 0,
        outputTokens: 0,
        tokens: 0,
        minutes: 0,
        sessions: 0,
      })
    }

    // Per-session stats
    const sessionStats: SessionUsageStat[] = []

    for (const session of sessions) {
      const { input, output } = this.extractTokensFromMessages(session.messages_json)
      const sessionTokens = input + output

      // Session duration
      const startedAt = session.started_at ? new Date(session.started_at) : null
      const endedAt = session.ended_at ? new Date(session.ended_at) : null
      let sessionMinutes = 0
      if (startedAt) {
        const end = endedAt || new Date()
        sessionMinutes = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60000))
      }

      // Add to session stats if has any tokens
      if (sessionTokens > 0) {
        sessionStats.push({
          sessionId: session.id,
          sessionName: session.name || `Session #${session.id.slice(0, 6)}`,
          tokens: sessionTokens,
          minutes: sessionMinutes,
        })
      }

      // Attribute to daily bucket based on session start date
      const sessionDate = session.started_at?.slice(0, 10)
      if (sessionDate && dailyMap.has(sessionDate)) {
        const bucket = dailyMap.get(sessionDate)!
        bucket.inputTokens += input
        bucket.outputTokens += output
        bucket.tokens += sessionTokens
        bucket.minutes += sessionMinutes
        bucket.sessions += 1
      }
    }

    // Sort session stats by tokens descending
    sessionStats.sort((a, b) => b.tokens - a.tokens)

    return {
      dailyStats: Array.from(dailyMap.values()),
      sessionStats,
    }
  }

  /**
   * Get stored messages for a specific session (for cross-session search)
   */
  getSessionMessages(sessionId: string): StoredMessage[] {
    const row = this.db.raw.prepare(
      'SELECT messages_json FROM sessions WHERE id = ?'
    ).get(sessionId) as any

    if (!row?.messages_json) return []

    try {
      const messages = JSON.parse(row.messages_json)
      return Array.isArray(messages) ? messages : []
    } catch {
      return []
    }
  }

  /**
   * Extract token counts from messages JSON
   */
  private extractTokensFromMessages(messagesJson: string): { input: number; output: number } {
    let input = 0
    let output = 0

    if (!messagesJson || messagesJson === '[]') return { input, output }

    try {
      const messages: StoredMessage[] = JSON.parse(messagesJson)
      for (const msg of messages) {
        if (msg.usage) {
          input += msg.usage.inputTokens || 0
          output += msg.usage.outputTokens || 0
        }
      }
    } catch {
      // Invalid JSON, skip
    }

    return { input, output }
  }
}
