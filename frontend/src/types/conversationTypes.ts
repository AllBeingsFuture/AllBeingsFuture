/**
 * 对话相关类型定义
 * 从 claudeops shared/types 移植，适配 allbeingsfuture 前端
 */

export type ToolResultStream = 'stdout' | 'stderr'

export interface ToolStreamOutput {
  stream: ToolResultStream
  text: string
}

export interface FileChangeInfo {
  filePath: string
  changeType: 'edit' | 'create' | 'write' | 'delete'
  operationDiff: string
  cumulativeDiff?: string
  additions: number
  deletions: number
}

export interface ConversationAttachment {
  name: string
  type: string
  size: number
  url?: string
}

export interface ConversationMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result'
  content: string
  timestamp: string
  attachments?: ConversationAttachment[]
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolOutputs?: ToolStreamOutput[]
  isError?: boolean
  thinkingText?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens?: number
    cacheReadTokens?: number
  }
  toolUseId?: string
  isDelta?: boolean
  isThinking?: boolean
  fileChange?: FileChangeInfo
}

export type TelegramBotStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface TelegramAIProviderConfig {
  id: string
  name: string
  apiKey: string
  model: string
}

export interface TelegramAllowedUser {
  userId: number
  username?: string
  displayName?: string
  role: string
}
