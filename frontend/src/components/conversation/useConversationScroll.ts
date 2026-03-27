import { useCallback, useEffect, useRef } from 'react'

interface UseConversationScrollOptions {
  sessionId: string
  messagesLength: number
  streaming: boolean
}

/**
 * Custom hook that manages auto-scroll behavior for the conversation view.
 *
 * - Force-scrolls to bottom for 3s after session switch
 * - Auto-scrolls on new messages when user is near the bottom
 * - Exposes refs for the scroll container and bottom sentinel
 */
export function useConversationScroll({
  sessionId,
  messagesLength,
  streaming,
}: UseConversationScrollOptions) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)
  const forceScrollUntilRef = useRef(0)

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 150
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  // Reset scroll tracking on session switch
  useEffect(() => {
    prevMsgCountRef.current = 0
    isNearBottomRef.current = true
    forceScrollUntilRef.current = Date.now() + 3000
  }, [sessionId])

  // Auto-scroll logic
  useEffect(() => {
    const previousCount = prevMsgCountRef.current
    prevMsgCountRef.current = messagesLength
    const forceScroll = Date.now() < forceScrollUntilRef.current

    if (forceScroll && messagesLength > 0) {
      // During the force-scroll window (3s) after session switch, every
      // messages update scrolls to bottom. Double-rAF ensures React has
      // flushed all DOM nodes before we measure scrollHeight.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollContainerRef.current
          if (el) el.scrollTop = el.scrollHeight
        })
      })
      return
    }

    if (!isNearBottomRef.current) return

    if (messagesLength > previousCount) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messagesLength, streaming])

  return {
    bottomRef,
    scrollContainerRef,
    handleScroll,
  }
}
