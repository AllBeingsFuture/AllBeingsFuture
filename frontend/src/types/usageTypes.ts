/**
 * Token 用量数据类型定义
 */

/** 用量汇总 */
export interface UsageSummary {
  /** 今日消耗 token */
  todayTokens: number
  /** 今日使用时长（分钟） */
  todayMinutes: number
  /** 累计消耗 token */
  totalTokens: number
  /** 累计使用时长（分钟） */
  totalMinutes: number
  /** 当前活跃会话数 */
  activeSessions: number
}

/** 每日用量统计 */
export interface DailyStat {
  date: string
  inputTokens: number
  outputTokens: number
  /** 总 token（可选，前端可计算） */
  tokens?: number
  /** 使用时长（分钟） */
  minutes: number
  /** 活跃会话数 */
  sessions: number
}

/** 按会话维度的用量统计 */
export interface SessionUsageStat {
  sessionId: string
  sessionName: string
  tokens: number
  minutes: number
}

/** getHistory 返回的整体数据 */
export interface UsageHistory {
  dailyStats: DailyStat[]
  sessionStats: SessionUsageStat[]
}
