import type {
  InitializeResponse,
  PermissionOption,
  PlanEntry,
  RequestPermissionOutcome,
  StopReason,
  ToolCallStatus,
  ToolKind,
} from '@agentclientprotocol/sdk'

export type BridgeEventKind =
  | 'text'
  | 'thinking'
  | 'tool'
  | 'plan'
  | 'permission'
  | 'status'
  | 'error'
  | 'agent_task'

export interface BridgeEvent {
  event: 'delta' | 'done' | 'error' | 'tool' | 'thinking' | 'agent_task' | 'plan' | 'permission' | 'status'
  type?: BridgeEventKind
  id?: string | null
  text?: string
  messageKind?: 'assistant' | 'agent'
  itemId?: string
  error?: string
  name?: string
  input?: Record<string, unknown>
  output?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_read_tokens?: number
    cache_creation_input_tokens?: number
    cache_creation_tokens?: number
  }
  conversationId?: string
  stopReason?: StopReason
  turnActive?: boolean
  phase?: string
  detail?: string
  initializeResponse?: InitializeResponse
  toolCallId?: string
  toolKind?: ToolKind
  toolStatus?: ToolCallStatus
  isUpdate?: boolean
  planId?: string
  entries?: PlanEntry[]
  options?: PermissionOption[]
  outcome?: RequestPermissionOutcome
  /** JSON-RPC / UI permission request id for session/request_permission */
  requestId?: string
  // agent_task fields used by the existing compatibility adapters.
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

export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result'
  thinking?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | unknown
}

export type BridgeEventCallback = (event: BridgeEvent) => void

export interface ProviderAdapter {
  currentRequestId: string | null
  envOverrides?: Record<string, string>
  resumeFlag?: string
  init(): Promise<void>
  send(message: string, images?: Array<{ data: string; mimeType: string }>): Promise<void>
  stop(): Promise<void>
  destroy(): Promise<void>
  isAlive?(): boolean
}
