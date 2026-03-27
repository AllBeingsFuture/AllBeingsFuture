/**
 * Shared types for the process service modules.
 */

/** A single tool-use entry as emitted by the SDK / bridge */
export interface ToolUseEntry {
  name: string
  input: Record<string, unknown>
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

/** Event objects emitted by the bridge adapter */
export interface BridgeEvent {
  event: 'delta' | 'done' | 'error' | 'tool' | 'thinking' | 'agent_task'
  text?: string
  error?: string
  name?: string
  input?: Record<string, unknown>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_read_tokens?: number
    cache_creation_input_tokens?: number
    cache_creation_tokens?: number
  }
  conversationId?: string
  // agent_task fields
  subtype?: 'task_started' | 'task_progress' | 'task_notification'
  task_id?: string
  taskId?: string
  session_id?: string
  sessionId?: string
  description?: string
  prompt?: string
  summary?: string
  message?: string | { content?: ContentBlock[] }
  status?: string
  result?: string
  data?: Record<string, unknown>
  tool_name?: string
  toolName?: string
  tool_input?: Record<string, unknown>
  toolInput?: Record<string, unknown>
  thinking?: string
  content?: ContentBlock[]
  content_blocks?: ContentBlock[]
}

/** A content block inside a bridge event */
export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result'
  thinking?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | unknown
}

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
  toolUse?: ToolUseEntry[]
  thinking?: string
  images?: string[]
  /** For role: 'tool_use' — the tool name */
  toolName?: string
  /** For role: 'tool_use' — the tool input parameters */
  toolInput?: Record<string, unknown>
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

export interface SessionState {
  messages: ChatMessage[]
  streaming: boolean
  error: string
  conversationId: string
}
