import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'

interface UseConversationScrollOptions {
  sessionId: string
  messagesLength: number
  streaming: boolean
  bottomOffset: number
  /**
   * Bumps when the live tail content changes without changing messagesLength
   * (token deltas / upsert_last). While stick-to-bottom is active, this must
   * re-pin so virtual-list spacer growth does not leave the latest text below
   * the fold waiting on ResizeObserver alone.
   */
  liveTailRevision?: number | string
}

interface ScrollMetrics {
  scrollTop: number
  viewportHeight: number
  /** Extra virtual overscan while user is reading history so the mount window keeps up. */
  overscanBoostPx: number
}

const FORCE_SCROLL_WINDOW_MS = 3000
const NEAR_BOTTOM_THRESHOLD_PX = 150
/** Re-attach only when this close to the live tail (hysteresis vs detach). */
const USER_REATTACH_THRESHOLD_PX = 32
/**
 * One post-layout frame is enough for RO/estimate growth to settle.
 * Two frames doubled thrash when liveTailRevision + ResizeObserver both pin.
 */
const FOLLOW_UP_SCROLL_FRAMES = 1
const PROGRAMMATIC_SCROLL_GUARD_MS = 150
/** Large per-event jump — sync virtual window immediately + extra overscan. */
const FAST_SCROLL_DELTA_PX = 48
/** Cap overscan boost so a single huge delta does not mount the entire history. */
const MAX_OVERSCAN_BOOST_PX = 3200
/** Baseline overscan boost while reading history (any speed). */
const HISTORY_OVERSCAN_BOOST_PX = 800

/**
 * 统一管理会话视图的滚动行为。
 *
 * 要点：
 * - 切换会话后短暂强制跟随到底部，确保历史记录落在最新位置
 * - 用户一旦上滑（任意速度：滚轮/触控板/拖条）立即 detach，流式增高绝不能抢视口
 * - 阅读历史期间禁止虚拟列表「正补偿」scrollTop，避免 remeasure 与上滑对打
 * - 仅在用户明确向下回到贴底带时 re-attach
 * - 快速大 delta 额外同步 metrics / 加大 overscan（慢滑同样走 detach + 禁正补偿）
 */
export function useConversationScroll({
  sessionId,
  messagesLength,
  streaming,
  bottomOffset,
  liveTailRevision = 0,
}: UseConversationScrollOptions) {
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    viewportHeight: 0,
    overscanBoostPx: 0,
  })

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
  /** scrollTop we last wrote programmatically; used so user nudges within the guard window still detach. */
  const lastProgrammaticScrollTopRef = useRef<number | null>(null)
  const userInputActiveRef = useRef(false)
  /** Last non-programmatic vertical intent: up = reading history, down = toward live tail. */
  const lastUserScrollIntentRef = useRef<'up' | 'down' | null>(null)
  const lastUserScrollDeltaRef = useRef(0)

  /**
   * Mark a scrollTop write as programmatic. Prefer passing the target scrollTop so
   * a real user scroll that lands elsewhere within PROGRAMMATIC_SCROLL_GUARD_MS is
   * not swallowed (that bug re-stuck the viewport on streaming ResizeObserver).
   */
  const markProgrammaticScroll = useCallback((targetScrollTop?: number) => {
    lastProgrammaticScrollAtRef.current = Date.now()
    if (typeof targetScrollTop === 'number' && Number.isFinite(targetScrollTop)) {
      lastProgrammaticScrollTopRef.current = targetScrollTop
      return
    }
    const el = scrollContainerRef.current
    lastProgrammaticScrollTopRef.current = el ? el.scrollTop : null
  }, [])

  const historyOverscanBoost = useCallback((magnitudePx = 0) => {
    const dynamic = Math.min(MAX_OVERSCAN_BOOST_PX, Math.round(Math.abs(magnitudePx) * 4))
    return Math.min(MAX_OVERSCAN_BOOST_PX, Math.max(HISTORY_OVERSCAN_BOOST_PX, dynamic))
  }, [])

  /**
   * While the user is reading history, remeasure must never push scrollTop down
   * (positive delta). This is the general fix for both slow and fast scroll-up —
   * not a short fling-only window.
   */
  const shouldSuppressPositiveScrollCompensation = useCallback(() => {
    return userDetachedRef.current || lastUserScrollIntentRef.current === 'up'
  }, [])

  const commitScrollMetrics = useCallback((overscanBoostPx?: number) => {
    const el = scrollContainerRef.current
    if (!el) return

    setScrollMetrics((prev) => {
      const readingHistory = userDetachedRef.current || lastUserScrollIntentRef.current === 'up'
      const nextBoost = overscanBoostPx !== undefined
        ? overscanBoostPx
        : (readingHistory
          ? Math.max(prev.overscanBoostPx, HISTORY_OVERSCAN_BOOST_PX)
          : 0)
      const next = {
        scrollTop: el.scrollTop,
        viewportHeight: el.clientHeight,
        overscanBoostPx: nextBoost,
      }
      return prev.scrollTop === next.scrollTop
        && prev.viewportHeight === next.viewportHeight
        && prev.overscanBoostPx === next.overscanBoostPx
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

  const detachFromBottomNow = useCallback((overscanMagnitudePx = 0) => {
    userDetachedRef.current = true
    lastUserScrollIntentRef.current = 'up'
    forceScrollUntilRef.current = 0
    cancelPendingAutoScroll()
    lastUserScrollDeltaRef.current = -Math.abs(overscanMagnitudePx || lastUserScrollDeltaRef.current || HISTORY_OVERSCAN_BOOST_PX)
    commitScrollMetrics(historyOverscanBoost(Math.abs(overscanMagnitudePx) || HISTORY_OVERSCAN_BOOST_PX))
  }, [cancelPendingAutoScroll, commitScrollMetrics, historyOverscanBoost])

  const shouldStickToBottom = useCallback(() => {
    // Detach / upward intent always wins — including wheel-up before scroll.
    if (userDetachedRef.current) return false
    if (lastUserScrollIntentRef.current === 'up') return false
    if (userInputActiveRef.current && !isNearBottomRef.current) return false
    return true
  }, [])

  const applyScrollToBottom = useCallback(() => {
    // Never fight the user: any detach or upward intent leaves the viewport alone.
    if (!shouldStickToBottom()) return

    const el = scrollContainerRef.current
    if (!el) return

    const nextScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    markProgrammaticScroll(nextScrollTop)
    if (Math.abs(el.scrollTop - nextScrollTop) > 1) {
      el.scrollTop = nextScrollTop
    }

    lastScrollTopRef.current = nextScrollTop
    isNearBottomRef.current = true
    // Do NOT clear userDetachedRef here — that raced with wheel-up detach.
    lastContentHeightRef.current = el.scrollHeight
    commitScrollMetrics(0)
  }, [commitScrollMetrics, markProgrammaticScroll, shouldStickToBottom])

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

    // Sync pin every time height may have changed (liveTailRevision / RO).
    // Follow-up rAF is coalesced inside queueFollowUpAutoScroll so dual observers
    // + layout effect do not stack multiple post-paint frames per token.
    applyScrollToBottom()
    queueFollowUpAutoScroll()
  }, [applyScrollToBottom, cancelPendingAutoScroll, queueFollowUpAutoScroll])

  /**
   * User intentionally sent a message: re-attach stick-to-bottom and scroll now.
   * Must clear detach / upward intent BEFORE scroll — applyScrollToBottom deliberately
   * does not clear userDetachedRef (avoids racing with wheel-up).
   */
  const stickToBottomNow = useCallback(() => {
    userDetachedRef.current = false
    lastUserScrollIntentRef.current = 'down'
    userInputActiveRef.current = false
    isNearBottomRef.current = true
    // Short force window so early streaming ResizeObserver growth still sticks.
    forceScrollUntilRef.current = Date.now() + FORCE_SCROLL_WINDOW_MS
    scrollToBottom(true)
  }, [scrollToBottom])

  /**
   * 内容尺寸变化时的滚动策略：
   * - 贴底跟随：继续 scrollToBottom
   * - 已脱离：绝不自动滚到底；仅在 scrollHeight 变矮导致超出可滚范围时夹紧
   * - 视口上方条目重测的精确补偿由虚拟列表负责，且阅读历史时不做正补偿
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

    // Detached: never pull toward bottom. Only clamp if we overflow the max range.
    if (previousHeight > 0 && nextHeight < previousHeight) {
      const maxScrollTop = Math.max(nextHeight - el.clientHeight, 0)
      if (el.scrollTop > maxScrollTop) {
        markProgrammaticScroll(maxScrollTop)
        el.scrollTop = maxScrollTop
        lastScrollTopRef.current = maxScrollTop
      }
    }

    // Keep virtual window in sync while reading history (any speed).
    commitScrollMetrics()
  }, [commitScrollMetrics, markProgrammaticScroll, scrollToBottom, shouldStickToBottom])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0)
    const nextIsNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
    const delta = el.scrollTop - lastScrollTopRef.current
    const scrolledUp = delta < -1
    const scrolledDown = delta > 1
    const largeJump = Math.abs(delta) >= FAST_SCROLL_DELTA_PX
    const timeSinceProgrammatic = Date.now() - lastProgrammaticScrollAtRef.current
    // Time alone is not enough: initial pin / stick-to-bottom marks programmatic,
    // then a real user scroll within ~150ms must still detach. Only treat the
    // event as programmatic when scrollTop still matches the last write target.
    const expectedProgrammaticTop = lastProgrammaticScrollTopRef.current
    const matchesProgrammaticTarget = expectedProgrammaticTop != null
      && Math.abs(el.scrollTop - expectedProgrammaticTop) <= 2
    const isProgrammatic = timeSinceProgrammatic < PROGRAMMATIC_SCROLL_GUARD_MS
      && (expectedProgrammaticTop == null || matchesProgrammaticTarget)

    // Track real user intent only. Programmatic follow / remeasure writes are ignored.
    if (!isProgrammatic) {
      if (scrolledUp) {
        lastUserScrollIntentRef.current = 'up'
        lastUserScrollDeltaRef.current = delta
        // Any non-programmatic upward movement detaches — slow scrollbar drag,
        // gentle trackpad, or fling. The old "must leave 32px band" gate left
        // slow nudges still stuck, so streaming ResizeObserver yanked them back.
        detachFromBottomNow(Math.abs(delta))
      } else if (scrolledDown) {
        lastUserScrollIntentRef.current = 'down'
      }
    }

    // Re-attach only when the user intentionally scrolls back into the live tail.
    if (
      !isProgrammatic
      && scrolledDown
      && distanceFromBottom <= USER_REATTACH_THRESHOLD_PX
      && lastUserScrollIntentRef.current === 'down'
    ) {
      userDetachedRef.current = false
      userInputActiveRef.current = false
      lastUserScrollIntentRef.current = 'down'
    }

    isNearBottomRef.current = nextIsNearBottom
    lastScrollTopRef.current = el.scrollTop
    lastContentHeightRef.current = el.scrollHeight

    // Reading history or large jumps: publish scrollTop immediately so the virtual
    // window does not lag one rAF behind (blank spacer → feels stuck at any speed).
    if (userDetachedRef.current || lastUserScrollIntentRef.current === 'up' || largeJump) {
      commitScrollMetrics(
        userDetachedRef.current || lastUserScrollIntentRef.current === 'up'
          ? historyOverscanBoost(Math.abs(delta))
          : undefined,
      )
    } else {
      syncScrollMetrics()
    }
  }, [commitScrollMetrics, detachFromBottomNow, historyOverscanBoost, syncScrollMetrics])

  /**
   * Wheel/trackpad intent fires before the corresponding scroll event.
   * Detach immediately on any upward wheel so streaming cannot snap back mid-gesture.
   */
  const handleWheel = useCallback((event?: ReactWheelEvent<HTMLDivElement> | WheelEvent) => {
    userInputActiveRef.current = true
    const deltaY = event?.deltaY ?? 0
    // deltaY < 0 → content moves down / user reads older messages (scroll up)
    if (deltaY < 0) {
      detachFromBottomNow(Math.abs(deltaY))
      return
    }
    if (deltaY > 0) {
      lastUserScrollIntentRef.current = 'down'
    }
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
    lastProgrammaticScrollTopRef.current = null
    userInputActiveRef.current = false
    lastUserScrollIntentRef.current = null
    lastUserScrollDeltaRef.current = 0
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

  // useLayoutEffect so stick happens before paint when token deltas grow the
  // virtual spacer — avoids one-frame "latest text below fold" flashes.
  useLayoutEffect(() => {
    const previousCount = prevMsgCountRef.current
    prevMsgCountRef.current = messagesLength

    if (!shouldStickToBottom()) return

    if (messagesLength > previousCount) {
      scrollToBottom(true)
      return
    }

    // Streaming often mutates the last bubble in place (length stable). Pin on
    // content revision as well as RO growth so the latest delta stays visible.
    if (streaming && messagesLength > 0) {
      scrollToBottom(true)
    }
  }, [liveTailRevision, messagesLength, scrollToBottom, shouldStickToBottom, streaming])

  return {
    bottomRef,
    contentRef,
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    scrollMetrics,
    scrollToBottom,
    /**
     * Explicit user-send re-attach: clear detach/up intent, then scroll to bottom.
     * Call from handleSend so streaming growth sticks after the user had scrolled up.
     */
    stickToBottomNow,
    /** Mark scrollTop writes from virtual-list remeasure so they do not re-stick. */
    markProgrammaticScroll,
    /**
     * True for the whole "reading history" period (any scroll speed).
     * Virtual list must not apply positive scrollTop compensation while this is true.
     */
    shouldSuppressPositiveScrollCompensation,
  }
}
