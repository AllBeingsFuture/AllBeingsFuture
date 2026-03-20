/**
 * SDK V2 对话管理 Hook
 *
 * 使用 Zustand store 作为唯一数据源。
 * 替代 PTY 模式下的 useTerminal Hook。
 *
 * 注意：allbeingsfuture 的 sessionStore 结构与 claudeops 不同，
 * 此 hook 适配 allbeingsfuture 的 sessionStore API。
 */

import { useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { ConversationMessage } from '../types/conversationTypes'

export interface QueuedMessage {
  id: string
  text: string
  queuedAt: string
  strategy?: string
}

export interface MessageDispatchResult {
  dispatched: boolean
  scheduled: boolean
  strategy?: 'interrupt_now' | 'queue_after_turn'
  queueLength?: number
  reason?: 'session_starting' | 'session_running'
}

interface UseConversationReturn {
  messages: ConversationMessage[]
  isStreaming: boolean
  isLoading: boolean
  sendMessage: (text: string) => Promise<MessageDispatchResult | undefined>
  respondPermission: (accept: boolean) => Promise<void>
  respondQuestion: (answers: Record<string, string>) => Promise<void>
  approvePlan: (approved: boolean) => Promise<void>
  abortSession: () => Promise<void>
}

/** Extended message shape that may arrive from the Go backend at runtime. */
interface ExtendedChatMessage {
  role?: string
  content?: string
  id?: string
  timestamp?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolOutputs?: { stream: string; text: string }[]
  isError?: boolean
  toolUseId?: string
  isDelta?: boolean
  isThinking?: boolean
  thinkingText?: string
  fileChange?: ConversationMessage['fileChange']
  usage?: ConversationMessage['usage']
}

let messageIdCounter = 0

export function useConversation(sessionId: string): UseConversationReturn {
  const sessionIdRef = useRef(sessionId)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Adapt to allbeingsfuture sessionStore which uses flat messages array
  const storeMessages = useSessionStore(state => state.messages)
  const isStreaming = useSessionStore(state => state.streaming)

  // Map ChatMessage[] to ConversationMessage[] (compatible shim)
  const messages: ConversationMessage[] = storeMessages.map((raw) => {
    const msg = raw as unknown as ExtendedChatMessage
    return {
      id: msg.id || `msg-${++messageIdCounter}`,
      sessionId,
      role: (msg.role || 'assistant') as ConversationMessage['role'],
      content: msg.content || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      toolName: msg.toolName,
      toolInput: msg.toolInput,
      toolResult: msg.toolResult,
      toolOutputs: msg.toolOutputs as ConversationMessage['toolOutputs'],
      isError: msg.isError,
      toolUseId: msg.toolUseId,
      isDelta: msg.isDelta,
      isThinking: msg.isThinking,
      thinkingText: msg.thinkingText,
      fileChange: msg.fileChange,
      usage: msg.usage,
    }
  })

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return undefined

    try {
      await useSessionStore.getState().sendMessage(sessionIdRef.current, text)
      return { dispatched: true, scheduled: false } as MessageDispatchResult
    } catch (err) {
      console.error('[useConversation] Failed to send message:', err)
      return undefined
    }
  }, [])

  const respondPermission = useCallback(async (accept: boolean) => {
    try {
      await (window.allBeingsFuture?.session as Record<string, (...args: unknown[]) => Promise<unknown>>)?.respondPermission?.(sessionIdRef.current, accept)
    } catch (err) {
      console.error('[useConversation] Failed to respond permission:', err)
    }
  }, [])

  const respondQuestion = useCallback(async (answers: Record<string, string>) => {
    try {
      await (window.allBeingsFuture?.session as Record<string, (...args: unknown[]) => Promise<unknown>>)?.answerQuestion?.(sessionIdRef.current, answers)
    } catch (err) {
      console.error('[useConversation] Failed to answer question:', err)
    }
  }, [])

  const approvePlan = useCallback(async (approved: boolean) => {
    try {
      await (window.allBeingsFuture?.session as Record<string, (...args: unknown[]) => Promise<unknown>>)?.approvePlan?.(sessionIdRef.current, approved)
    } catch (err) {
      console.error('[useConversation] Failed to approve plan:', err)
    }
  }, [])

  const abortSession = useCallback(async () => {
    try {
      await useSessionStore.getState().stopProcess(sessionIdRef.current)
    } catch (err) {
      console.error('[useConversation] Failed to abort session:', err)
    }
  }, [])

  return {
    messages,
    isStreaming,
    isLoading: false,
    sendMessage,
    respondPermission,
    respondQuestion,
    approvePlan,
    abortSession,
  }
}
