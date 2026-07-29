import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'

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
const PROGRAMMATIC_SCROLL_GUARD_MS = 150

/**
 * 统一管理会话视图的滚动行为。
 *
 * 要点：
 * - 切换会话后短暂强制跟随到底部，确保历史记录落在最新位置
 * - 用户手动滚离底部后停止自动跟随，避免“抢滚动条”
 * - 监听已渲染内容尺寸变化，修复流式更新 / 虚拟列表重测后无法跟上最新内容的问题
 * - 脱离跟随后，内容增高只做视口上方补偿，绝不再强制滚到底部
 * - 滚轮/触控板向上意图在 scroll 事件之前就 detach，避免流式增高立刻把视口拽回底部
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
  const lastContentHeightRef = useRef(0)
  const lastProgrammaticScrollAtRef = useRef(0)
  const userInputActiveRef = useRef(false)

  const markProgrammaticScroll = useCallback(() => {
    lastProgrammaticScrollAtRef.current = Date.now()
  }, [])

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

  const detachFromBottomNow = useCallback(() => {
    userDetachedRef.current = true
    forceScrollUntilRef.current = 0
    cancelPendingAutoScroll()
  }, [cancelPendingAutoScroll])

  const shouldStickToBottom = useCallback(() => {
    // Detach always wins — including wheel-up intent that fires before scroll.
    // Force window only helps initial pin while still attached.
    if (userDetachedRef.current) return false
    if (userInputActiveRef.current && !isNearBottomRef.current) return false
    return true
  }, [])

  const applyScrollToBottom = useCallback(() => {
    // Never fight the user: if they already detached (e.g. wheel-up during a
    // pending follow-up frame), leave the viewport alone and keep detach.
    if (userDetachedRef.current) return

    const el = scrollContainerRef.current
    if (!el) return

    const nextScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    markProgrammaticScroll()
    if (Math.abs(el.scrollTop - nextScrollTop) > 1) {
      el.scrollTop = nextScrollTop
    }

    lastScrollTopRef.current = nextScrollTop
    isNearBottomRef.current = true
    // Do NOT clear userDetachedRef here. Clearing it raced with wheel-up
    // detach and yanked readers back to the live tail when history is long.
    lastContentHeightRef.current = el.scrollHeight
    commitScrollMetrics()
  }, [commitScrollMetrics, markProgrammaticScroll])

  const queueFollowUpAutoScroll = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') return
    if (autoScrollFrameRef.current !== null) return

    let remainingFrames = FOLLOW_UP_SCROLL_FRAMES
    const tick = () => {
      autoScrollFrameRef.current = null
      if (!shouldStickToBottom()) return
      applyScrollToBottom()
      remainingFrames -= 1
      if (remainingFrames <= 0) return
      autoScrollFrameRef.current = requestAnimationFrame(tick)
    }

    autoScrollFrameRef.current = requestAnimationFrame(tick)
  }, [applyScrollToBottom, shouldStickToBottom])

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

  /**
   * 内容尺寸变化时的滚动策略：
   * - 贴底跟随：继续 scrollToBottom
   * - 已脱离：绝不自动滚到底；仅在 scrollHeight 变矮导致超出可滚范围时夹紧
   * - 视口上方条目重测的精确补偿由虚拟列表按 item start 完成（避免把底部流式增高误当成上方增长）
   */
  const preserveScrollAnchorOnContentResize = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const nextHeight = el.scrollHeight
    const previousHeight = lastContentHeightRef.current
    lastContentHeightRef.current = nextHeight

    if (shouldStickToBottom()) {
      scrollToBottom(true)
      return
    }

    if (previousHeight > 0 && nextHeight < previousHeight) {
      const maxScrollTop = Math.max(nextHeight - el.clientHeight, 0)
      if (el.scrollTop > maxScrollTop) {
        markProgrammaticScroll()
        el.scrollTop = maxScrollTop
        lastScrollTopRef.current = maxScrollTop
      }
    }

    syncScrollMetrics()
  }, [markProgrammaticScroll, scrollToBottom, shouldStickToBottom, syncScrollMetrics])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0)
    const nextIsNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
    const delta = el.scrollTop - lastScrollTopRef.current
    const scrolledUp = delta < -1
    const timeSinceProgrammatic = Date.now() - lastProgrammaticScrollAtRef.current
    const isProgrammatic = timeSinceProgrammatic < PROGRAMMATIC_SCROLL_GUARD_MS

    // Scrolling up past a small threshold always detaches, even during the
    // programmatic-scroll guard (auto-follow only increases scrollTop) and even
    // inside the wider "near bottom" follow band.
    if (scrolledUp && distanceFromBottom > USER_DETACH_THRESHOLD_PX) {
      detachFromBottomNow()
    } else if (!isProgrammatic && distanceFromBottom <= USER_DETACH_THRESHOLD_PX) {
      // Re-attach only when truly back at the bottom (hysteresis vs detach threshold).
      userDetachedRef.current = false
      userInputActiveRef.current = false
    }

    isNearBottomRef.current = nextIsNearBottom
    lastScrollTopRef.current = el.scrollTop
    lastContentHeightRef.current = el.scrollHeight
    syncScrollMetrics()
  }, [detachFromBottomNow, syncScrollMetrics])

  /**
   * Wheel/trackpad intent fires before the corresponding scroll event.
   * Detach immediately on upward intent so streaming ResizeObserver / message
   * updates cannot snap the viewport back to the live tail mid-gesture.
   */
  const handleWheel = useCallback((event?: ReactWheelEvent<HTMLDivElement> | WheelEvent) => {
    userInputActiveRef.current = true
    const deltaY = event?.deltaY ?? 0
    // deltaY < 0 → content moves down / user reads older messages (scroll up)
    if (deltaY < 0) {
      detachFromBottomNow()
      return
    }
    // Horizontal / no vertical motion still counts as user control while away
    // from the tail; stick decision is re-evaluated on the next scroll event.
  }, [detachFromBottomNow])

  const handlePointerDown = useCallback((_event?: ReactPointerEvent<HTMLDivElement> | PointerEvent) => {
    userInputActiveRef.current = true
  }, [])

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
    lastContentHeightRef.current = 0
    lastProgrammaticScrollAtRef.current = 0
    userInputActiveRef.current = false
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

    lastContentHeightRef.current = el.scrollHeight

    const observer = new ResizeObserver(() => {
      preserveScrollAnchorOnContentResize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [commitScrollMetrics, preserveScrollAnchorOnContentResize, sessionId])

  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      preserveScrollAnchorOnContentResize()
    })
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [preserveScrollAnchorOnContentResize, sessionId])

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
    handleWheel,
    handlePointerDown,
    scrollMetrics,
    scrollToBottom,
  }
}
