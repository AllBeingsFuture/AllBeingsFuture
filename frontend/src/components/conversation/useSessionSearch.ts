import { useState, useEffect, useCallback, useDeferredValue, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../../stores/sessionStore'
import { UsageService } from '../../../bindings/allbeingsfuture/internal/services'
import type { ConversationMessage } from '../../types/conversationTypes'

// ── Platform helpers ──

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

function isPrimaryModifierPressed(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

export function toPlatformShortcutLabel(shortcut: string): string {
  if (!isMac) return shortcut
  return shortcut
    .replace('Ctrl', '\u2318')
    .replace('Shift', '\u21E7')
    .replace('Alt', '\u2325')
}

// ── Utility functions ──

export function formatRelativeTime(isoString: string): string {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '\u521A\u521A'
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`
  if (days < 7) return `${days} \u5929\u524D`
  return new Date(isoString).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function truncate(text: string, maxLen = 200): string {
  if (!text) return ''
  const clean = text.replace(/\n+/g, ' ').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean
}

// ── Types ──

export interface SearchResultItem {
  sessionId: string
  sessionName: string
  sessionTimestamp: string
  message: ConversationMessage
  contextBefore?: ConversationMessage
  contextAfter?: ConversationMessage
}

export type SearchMode = 'cross' | 'current'

// ── Hook ──

interface UseSessionSearchOptions {
  currentSessionId: string
  initialMode?: SearchMode
  onClose: () => void
}

export function useSessionSearch({
  currentSessionId,
  initialMode = 'cross',
  onClose,
}: UseSessionSearchOptions) {
  const [mode, setMode] = useState<SearchMode>(initialMode)
  const [query, setQuery] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | 'all'>('all')
  const [showSessionFilter, setShowSessionFilter] = useState(false)
  const [loadedConversations, setLoadedConversations] = useState<Record<string, ConversationMessage[]>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<Set<string>>(new Set())
  const deferredQuery = useDeferredValue(query)

  const { allSessions, currentMessages } = useSessionStore(useShallow((state) => ({
    allSessions: state.sessions,
    currentMessages: state.messages,
  })))

  const targetSessions = useMemo(() => {
    return allSessions
      .filter(s => s.id !== currentSessionId)
      .sort((a, b) => {
        const ta = a.startedAt ? new Date(String(a.startedAt)).getTime() : 0
        const tb = b.startedAt ? new Date(String(b.startedAt)).getTime() : 0
        return tb - ta
      })
  }, [allSessions, currentSessionId])

  const currentSession = useMemo(
    () => allSessions.find((session) => session.id === currentSessionId),
    [allSessions, currentSessionId],
  )

  const currentConvMessages = useMemo((): ConversationMessage[] => {
    return currentMessages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m, idx) => ({
        id: `msg-${idx}`,
        sessionId: currentSessionId,
        role: m.role as ConversationMessage['role'],
        content: m.content,
        timestamp: String((m as { timestamp?: string }).timestamp || currentSession?.startedAt || ''),
      }))
  }, [currentMessages, currentSession?.startedAt, currentSessionId])

  // Auto-focus search input
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Click outside to close session filter
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowSessionFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (isPrimaryModifierPressed(e) && e.shiftKey && e.key.toUpperCase() === 'F') {
        e.preventDefault()
        setMode('cross')
        requestAnimationFrame(() => searchInputRef.current?.focus())
      } else if (isPrimaryModifierPressed(e) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setMode('current')
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** Lazy-load conversation history for a session */
  const loadConversation = useCallback(async (sessionId: string) => {
    if (loadingRef.current.has(sessionId)) return
    setLoadedConversations(prev => {
      if (prev[sessionId]) return prev
      loadingRef.current.add(sessionId)
      UsageService.GetSessionMessages(sessionId)
        .then(msgs => {
          if (msgs && Array.isArray(msgs) && msgs.length > 0) {
            const mapped: ConversationMessage[] = msgs
              .filter((m: any) => m.role && m.content)
              .map((m: any, idx: number) => ({
                id: m.id || `${sessionId}-msg-${idx}`,
                sessionId,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || '',
              }))
            setLoadedConversations(p => ({ ...p, [sessionId]: mapped }))
          }
        })
        .catch(err => {
          console.warn('[CrossSessionSearch] Failed to load conversation:', sessionId, err)
        })
        .finally(() => {
          loadingRef.current.delete(sessionId)
        })
      return prev
    })
  }, [])

  // Preload sessions
  useEffect(() => {
    if (mode !== 'cross') return
    if (selectedSessionId === 'all') {
      targetSessions.slice(0, 5).forEach(s => loadConversation(s.id))
    } else {
      loadConversation(selectedSessionId)
    }
  }, [mode, selectedSessionId, targetSessions, loadConversation])

  // Load all when searching
  useEffect(() => {
    if (!query.trim() || mode !== 'cross' || selectedSessionId !== 'all') return
    targetSessions.forEach(s => loadConversation(s.id))
  }, [query, mode, selectedSessionId, targetSessions, loadConversation])

  /** Search results */
  const searchResults = useMemo((): SearchResultItem[] => {
    const q = deferredQuery.trim().toLowerCase()

    if (mode === 'current') {
      const sessionName = currentSession?.name || `\u5F53\u524D\u4F1A\u8BDD #${currentSessionId.slice(0, 6)}`
      const sessionTimestamp = currentSession?.startedAt ? String(currentSession.startedAt) : ''

      return currentConvMessages
        .filter(m => !q || (m.content || '').toLowerCase().includes(q))
        .slice(0, 100)
        .map((msg, i) => ({
          sessionId: currentSessionId,
          sessionName,
          sessionTimestamp,
          message: msg,
          contextBefore: i > 0 ? currentConvMessages[i - 1] : undefined,
          contextAfter: i < currentConvMessages.length - 1 ? currentConvMessages[i + 1] : undefined,
        }))
    }

    const results: SearchResultItem[] = []
    const sessionsToSearch = selectedSessionId === 'all'
      ? targetSessions
      : targetSessions.filter(s => s.id === selectedSessionId)

    for (const session of sessionsToSearch) {
      const messages = loadedConversations[session.id] || []
      if (messages.length === 0) continue

      const searchableMessages = messages.filter(m =>
        (m.role === 'user' || m.role === 'assistant') && m.content
      )

      for (let i = 0; i < searchableMessages.length; i++) {
        const msg = searchableMessages[i]
        const content = msg.content || ''
        if (!q || content.toLowerCase().includes(q)) {
          results.push({
            sessionId: session.id,
            sessionName: session.name || `\u4F1A\u8BDD #${session.id.slice(0, 6)}`,
            sessionTimestamp: session.startedAt ? String(session.startedAt) : msg.timestamp,
            message: msg,
            contextBefore: i > 0 ? searchableMessages[i - 1] : undefined,
            contextAfter: i < searchableMessages.length - 1 ? searchableMessages[i + 1] : undefined,
          })
        }
      }
    }

    return results
      .sort((a, b) => new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime())
      .slice(0, 50)
  }, [mode, deferredQuery, selectedSessionId, targetSessions, loadedConversations, currentConvMessages, currentSession, currentSessionId])

  const isAllLoaded = mode === 'current'
    ? true
    : selectedSessionId === 'all'
      ? targetSessions.slice(0, 5).every(s => loadedConversations[s.id])
      : !!loadedConversations[selectedSessionId]

  const selectedSession = useMemo(
    () => targetSessions.find((session) => session.id === selectedSessionId),
    [selectedSessionId, targetSessions],
  )

  return {
    // State
    mode,
    setMode,
    query,
    setQuery,
    selectedSessionId,
    setSelectedSessionId,
    showSessionFilter,
    setShowSessionFilter,
    copiedId,
    setCopiedId,

    // Refs
    searchInputRef,
    filterRef,

    // Computed
    targetSessions,
    currentSession,
    currentConvMessages,
    searchResults,
    isAllLoaded,
    selectedSession,
  }
}
