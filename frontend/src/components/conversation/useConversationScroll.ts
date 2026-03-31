import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface UseConversationScrollOptions {
  sessionId: string
  messagesLength: number
  streaming: boolean
}

interface ScrollMetrics {
  scrollTop: number
  viewportHeight: number
}

const FORCE_SCROLL_WINDOW_MS = 3000
const NEAR_BOTTOM_THRESHOLD_PX = 150

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
}: UseConversationScrollOptions) {
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ scrollTop: 0, viewportHeight: 0 })

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollMetricsFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const isNearBottomRef = useRef(true)
  const didPinInitialHistoryRef = useRef(false)
  const prevMsgCountRef = useRef(0)
  const forceScrollUntilRef = useRef(0)

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
    isNearBottomRef.current || Date.now() < forceScrollUntilRef.current
  ), [])

  const scrollToBottom = useCallback((afterPaint = false) => {
    const applyScroll = () => {
      const el = scrollContainerRef.current
      if (!el) return

      const nextScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
      if (Math.abs(el.scrollTop - nextScrollTop) > 1) {
        el.scrollTop = nextScrollTop
      }

      isNearBottomRef.current = true
      commitScrollMetrics()
    }

    if (afterPaint && typeof requestAnimationFrame === 'function') {
      if (autoScrollFrameRef.current !== null) return
      autoScrollFrameRef.current = requestAnimationFrame(() => {
        autoScrollFrameRef.current = null
        applyScroll()

        // 第二帧兜底，处理虚拟列表二次测量和流式内容补渲染。
        autoScrollFrameRef.current = requestAnimationFrame(() => {
          autoScrollFrameRef.current = null
          applyScroll()
        })
      })
      return
    }

    cancelPendingAutoScroll()
    applyScroll()
  }, [cancelPendingAutoScroll, commitScrollMetrics])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX
    syncScrollMetrics()
  }, [syncScrollMetrics])

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
    didPinInitialHistoryRef.current = false
    forceScrollUntilRef.current = Date.now() + FORCE_SCROLL_WINDOW_MS
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
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [commitScrollMetrics, sessionId, syncScrollMetrics])

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
