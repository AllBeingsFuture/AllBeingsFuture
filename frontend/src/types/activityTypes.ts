export type ActivityEventType =
  | 'session_start'
  | 'thinking'
  | 'file_read'
  | 'file_write'
  | 'file_create'
  | 'file_delete'
  | 'command_execute'
  | 'command_output'
  | 'search'
  | 'tool_use'
  | 'error'
  | 'waiting_confirmation'
  | 'user_input'
  | 'turn_complete'
  | 'task_complete'
  | 'context_summary'
  | 'assistant_message'
  | 'idle'
  | 'unknown_activity'

export interface ActivityEvent {
  id: string
  sessionId: string
  type: ActivityEventType
  detail: string
  timestamp: string
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
