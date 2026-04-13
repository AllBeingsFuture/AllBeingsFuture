/**
 * Activity event types — keep in sync with electron/parser/types.ts
 */
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
  type: ActivityEventType
  detail: string
  timestamp: string
  raw?: string
  metadata?: Record<string, unknown>
}

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
