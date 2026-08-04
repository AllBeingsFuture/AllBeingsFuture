import type { ChatMessage } from '../../bindings/allbeingsfuture/internal/models/models'
import type { AgentSessionStreamState } from './agentStreamTypes'

export type ScrollMode = 'follow' | 'free'

export interface LiveToolEntry {
  toolCallId: string
  name?: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  input?: Record<string, unknown>
  resultText?: string
  outputs?: Array<{ stream: 'stdout' | 'stderr'; text: string }>
  error?: string
}

export interface LiveBuffer {
  thinking?: { itemId: string; text: string }
  assistantText?: { itemId: string; text: string }
  tools: LiveToolEntry[]
}

export interface SessionViewport {
  scrollMode: ScrollMode
}

export interface SessionStreamEntry {
  stream: AgentSessionStreamState
  committed: ChatMessage[]
  live: LiveBuffer | null
  viewport: SessionViewport
}
