/**
 * Shared types for the process service modules.
 */

/** A single tool-use entry as emitted by the SDK / bridge */
export interface ToolUseEntry {
  name: string
  input: Record<string, unknown>
  toolCallId?: string
  status?: string
  output?: unknown
}

/** Serialised info about a tracked agent (sent to the renderer) */
export interface AgentInfo {
  agentId: string
  name: string
  parentSessionId: string
  childSessionId: string
  status: string
  summary: string
  workDir: string
  createdAt: string
  completedAt?: string
  usage: { inputTokens: number; outputTokens: number }
  streaming: boolean
}

export type { BridgeEvent, ContentBlock } from '../bridge/types.js'
import type { ContentBlock } from '../bridge/types.js'

/** Body parsed from Agent API HTTP requests */
export interface AgentApiBody {
  parentSessionId?: string
  childSessionId?: string
  sessionId?: string
  name?: string
  prompt?: string
  providerId?: string
  message?: string
  timeout?: number
  lines?: number
  status?: string
  limit?: number
  query?: string
  maxMessages?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_use' | 'thinking'
  content: string
  timestamp: string
  /** Visual hint for renderer; defaults to normal assistant message when omitted */
  presentation?: 'message' | 'commentary'
  /** Provider-side item/message id so streaming deltas preserve message boundaries */
  sourceItemId?: string
  toolUse?: ToolUseEntry[]
  thinking?: string
  images?: string[]
  /** For role: 'tool_use' — the tool name */
  toolName?: string
  /** For role: 'tool_use' — the tool input parameters */
  toolInput?: Record<string, unknown>
  toolCallId?: string
  toolStatus?: string
  toolOutput?: unknown
  /** True when this is a thinking message */
  isThinking?: boolean
  /** Token usage for the completed turn */
  usage?: TokenUsage
  /** True when assistant is still streaming (partial) */
  partial?: boolean
  /** When set, this message belongs to a child agent's activity in the parent session */
  childSessionId?: string
  /** Display name of the child agent (only set together with childSessionId) */
  childAgentName?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface ChatState {
  messages: ChatMessage[]
  streaming: boolean
  error: string
}

export interface ChatPatchEvent {
  sessionId: string
  type: 'append' | 'upsert_last' | 'meta'
  message?: ChatMessage
  streaming: boolean
  error: string
}

export interface SessionState {
  messages: ChatMessage[]
  streaming: boolean
  error: string
  conversationId: string
}
