/**
 * Parser 模块类型定义
 */

// ---- AI Provider（Parser 层所需的最小字段） ----

export interface AIProvider {
  id: string
  name: string
  confirmationConfig?: ProviderConfirmationConfig
  stateConfig?: ProviderStateConfig
}

// ---- 会话状态 ----
// Keep in sync with frontend/src/types/activityTypes.ts

export type SessionStatus =
  | 'starting'
  | 'running'
  | 'idle'
  | 'waiting_input'
  | 'paused'
  | 'completed'
  | 'error'
  | 'terminated'
  | 'interrupted'

// ---- 活动事件 ----
// Canonical backend definition — keep in sync with frontend/src/types/activityTypes.ts

export type ActivityEventType =
  | 'session_start'
  | 'thinking'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'file_create'
  | 'file_delete'
  | 'command_execute'
  | 'command_output'
  | 'search'
  | 'tool_use'
  | 'error'
  | 'waiting_confirmation'
  | 'waiting_ask_question'
  | 'waiting_plan_approval'
  | 'user_input'
  | 'user_question'
  | 'turn_complete'
  | 'task_complete'
  | 'context_summary'
  | 'assistant_message'
  | 'session_end'
  | 'idle'
  | 'unknown_activity'

export interface ActivityEvent {
  id: string
  sessionId: string
  timestamp: string
  type: ActivityEventType
  detail: string
  raw?: string
  metadata?: Record<string, unknown>
}

// ---- 用量 ----

export interface UsageSummary {
  totalTokens: number
  totalMinutes: number
  todayTokens: number
  todayMinutes: number
  activeSessions: number
  sessionBreakdown: Record<string, number>
}

// ---- 确认检测 ----

export interface ConfirmationDetection {
  confidence: 'high' | 'medium'
  promptText: string
  originalLine: string
}

// ---- 解析规则 ----

export interface ParserRule {
  type: ActivityEventType
  priority: number
  patterns: RegExp[]
  extractDetail: (line: string) => string
  /** 绑定的 Provider ID，留空表示通用规则 */
  providerId?: string
}

// ---- Provider 扩展配置 ----

export interface ProviderConfirmationConfig {
  highPatterns: string[]
  mediumPatterns: string[]
}

export interface ProviderStateConfig {
  startupPattern?: string
  idleTimeoutMs?: number
  possibleStuckMs?: number
  stuckInterventionMs?: number
  startupStuckMs?: number
}

// ---- 解析器会话状态 ----

export interface ParserState {
  sessionId: string
  lastEventType: ActivityEventType | null
  lastOutputTime: number
  isThinking: boolean
  textBufferLines: string[]
  textBufferStartTime: number
  flushTimer: ReturnType<typeof setTimeout> | null
}
