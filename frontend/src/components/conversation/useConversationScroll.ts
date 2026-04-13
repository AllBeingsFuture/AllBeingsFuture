import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface UseConversationScrollOptions {
  sessionId: string
  messagesLength: number
  streaming: boolean
  bottomOffset: number
}

interface ScrollMetrics {
  scrollTop: number
  viewportHeight: number
}

const FORCE_SCROLL_WINDOW_MS = 3000
const NEAR_BOTTOM_THRESHOLD_PX = 150
const USER_DETACH_THRESHOLD_PX = 32
const FOLLOW_UP_SCROLL_FRAMES = 2

/**
 * 统一管理会话视图的滚动行为。
 *
 * 关键点：
 * - 切换会话后短暂强制跟随到底部，确保历史记录落在最新位置
 * - 用户手动滚离底部后停止自动跟随，避免“抢滚动条”
 * - 监听已渲染内容尺寸变化，修复流式更新 / 虚拟列表重测后无法跟上最新内容的问题
 */
export function useConversationScroll({
  sessionId,
  messagesLength,
  streaming,
  bottomOffset,
}: UseConversationScrollOptions) {
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ scrollTop: 0, viewportHeight: 0 })

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollMetricsFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const isNearBottomRef = useRef(true)
  const userDetachedRef = useRef(false)
  const didPinInitialHistoryRef = useRef(false)
  const prevMsgCountRef = useRef(0)
  const forceScrollUntilRef = useRef(0)
  const lastScrollTopRef = useRef(0)

  const commitScrollMetrics = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    setScrollMetrics((prev) => {
      const next = {
        scrollTop: el.scrollTop,
        viewportHeight: el.clientHeight,
      }
      return prev.scrollTop === next.scrollTop && prev.viewportHeight === next.viewportHeight
        ? prev
        : next
    })
  }, [])

  const syncScrollMetrics = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') {
      commitScrollMetrics()
      return
    }

    if (scrollMetricsFrameRef.current !== null) return
    scrollMetricsFrameRef.current = requestAnimationFrame(() => {
      scrollMetricsFrameRef.current = null
      commitScrollMetrics()
    })
  }, [commitScrollMetrics])

  const cancelPendingAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const shouldStickToBottom = useCallback(() => (
    !userDetachedRef.current || Date.now() < forceScrollUntilRef.current
  ), [])

  const applyScrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const nextScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    if (Math.abs(el.scrollTop - nextScrollTop) > 1) {
      el.scrollTop = nextScrollTop
    }

    lastScrollTopRef.current = nextScrollTop
    isNearBottomRef.current = true
    userDetachedRef.current = false
    commitScrollMetrics()
  }, [commitScrollMetrics])

  const queueFollowUpAutoScroll = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') return
    if (autoScrollFrameRef.current !== null) return

    let remainingFrames = FOLLOW_UP_SCROLL_FRAMES
    const tick = () => {
      autoScrollFrameRef.current = null
      applyScrollToBottom()
      remainingFrames -= 1
      if (remainingFrames <= 0) return
      autoScrollFrameRef.current = requestAnimationFrame(tick)
    }

    autoScrollFrameRef.current = requestAnimationFrame(tick)
  }, [applyScrollToBottom])

  const scrollToBottom = useCallback((afterPaint = false) => {
    if (!afterPaint) {
      cancelPendingAutoScroll()
      applyScrollToBottom()
      return
    }

    // 先立刻纠正一次，再保留后续帧兜底，避免流式内容增长时出现可见断档。
    applyScrollToBottom()
    queueFollowUpAutoScroll()
  }, [applyScrollToBottom, cancelPendingAutoScroll, queueFollowUpAutoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0)
    const nextIsNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
    const scrolledUp = el.scrollTop < lastScrollTopRef.current - 1

    if (scrolledUp && distanceFromBottom > USER_DETACH_THRESHOLD_PX) {
      userDetachedRef.current = true
      forceScrollUntilRef.current = 0
      cancelPendingAutoScroll()
    } else if (nextIsNearBottom) {
      userDetachedRef.current = false
    }

    isNearBottomRef.current = nextIsNearBottom
    lastScrollTopRef.current = el.scrollTop
    syncScrollMetrics()
  }, [cancelPendingAutoScroll, syncScrollMetrics])

  useEffect(() => {
    return () => {
      if (scrollMetricsFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scrollMetricsFrameRef.current)
        scrollMetricsFrameRef.current = null
      }
      cancelPendingAutoScroll()
    }
  }, [cancelPendingAutoScroll])

  useLayoutEffect(() => {
    prevMsgCountRef.current = 0
    isNearBottomRef.current = true
    userDetachedRef.current = false
    didPinInitialHistoryRef.current = false
    forceScrollUntilRef.current = Date.now() + FORCE_SCROLL_WINDOW_MS
    lastScrollTopRef.current = 0
  }, [sessionId])

  useLayoutEffect(() => {
    if (messagesLength === 0) return
    if (didPinInitialHistoryRef.current) return
    if (Date.now() >= forceScrollUntilRef.current) return

    didPinInitialHistoryRef.current = true
    scrollToBottom()
  }, [messagesLength, scrollToBottom, sessionId])

  useEffect(() => {
    commitScrollMetrics()

    const el = scrollContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      syncScrollMetrics()
      if (!shouldStickToBottom()) return
      scrollToBottom(true)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [commitScrollMetrics, scrollToBottom, sessionId, shouldStickToBottom, syncScrollMetrics])

  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      syncScrollMetrics()
      if (!shouldStickToBottom()) return
      scrollToBottom(true)
    })
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [scrollToBottom, sessionId, shouldStickToBottom, syncScrollMetrics])

  useLayoutEffect(() => {
    syncScrollMetrics()
    if (!shouldStickToBottom()) return
    scrollToBottom(true)
  }, [bottomOffset, scrollToBottom, shouldStickToBottom, syncScrollMetrics])

  useEffect(() => {
    const previousCount = prevMsgCountRef.current
    prevMsgCountRef.current = messagesLength

    if (!shouldStickToBottom()) return

    if (messagesLength > previousCount) {
      scrollToBottom(true)
      return
    }

    if (streaming && messagesLength > 0) {
      scrollToBottom(true)
    }
  }, [messagesLength, scrollToBottom, shouldStickToBottom, streaming])

  return {
    bottomRef,
    contentRef,
    scrollContainerRef,
    handleScroll,
    scrollMetrics,
    scrollToBottom,
  }
}
