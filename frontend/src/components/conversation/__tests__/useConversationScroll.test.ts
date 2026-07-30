import { act, renderHook } from '../../../test/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversationScroll } from '../useConversationScroll'

const originalResizeObserver = globalThis.ResizeObserver
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

const resizeObserverInstances: MockResizeObserver[] = []
let animationFrameId = 0
let animationFrameQueue = new Map<number, FrameRequestCallback>()

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback
  private readonly targets = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObserverInstances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  trigger() {
    if (this.targets.size === 0) return
    const entries = [...this.targets].map((target) => ({
      target,
      contentRect: target.getBoundingClientRect(),
    })) as ResizeObserverEntry[]
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

function installMocks() {
  resizeObserverInstances.length = 0
  animationFrameId = 0
  animationFrameQueue = new Map()
  ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver
  ;(globalThis as typeof globalThis & {
    requestAnimationFrame: typeof requestAnimationFrame
    cancelAnimationFrame: typeof cancelAnimationFrame
  }).requestAnimationFrame = ((callback: FrameRequestCallback) => {
    animationFrameId += 1
    animationFrameQueue.set(animationFrameId, callback)
    return animationFrameId
  }) as typeof requestAnimationFrame
  ;(globalThis as typeof globalThis & {
    cancelAnimationFrame: typeof cancelAnimationFrame
  }).cancelAnimationFrame = ((id: number) => {
    animationFrameQueue.delete(id)
  }) as typeof cancelAnimationFrame
}

function restoreMocks() {
  resizeObserverInstances.length = 0
  animationFrameQueue.clear()
  if (originalResizeObserver) {
    ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      originalResizeObserver
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  }
  if (originalRequestAnimationFrame) {
    ;(globalThis as typeof globalThis & { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
      originalRequestAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
  }
  if (originalCancelAnimationFrame) {
    ;(globalThis as typeof globalThis & { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
      originalCancelAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
  }
}

function flushAnimationFrames(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    const queued = [...animationFrameQueue.values()]
    animationFrameQueue.clear()
    if (queued.length === 0) return
    act(() => {
      queued.forEach((callback) => callback(performance.now()))
    })
  }
}

function createScrollContainer(metrics: {
  scrollHeight: number
  clientHeight: number
  scrollTop?: number
}) {
  const el = document.createElement('div')
  let scrollTop = metrics.scrollTop ?? 0
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  })
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  })
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })
  return { el, metrics }
}

type ScrollHookTestProps = {
  sessionId: string
  length: number
  streaming: boolean
  liveTailRevision?: number | string
}

/** Attach container and re-bind observers via a session change after the ref is set. */
function attachContainer(
  result: { current: ReturnType<typeof useConversationScroll> },
  el: HTMLDivElement,
  rerender: (props: ScrollHookTestProps) => void,
  props: ScrollHookTestProps,
) {
  act(() => {
    result.current.scrollContainerRef.current = el
    result.current.contentRef.current = el
  })
  // sessionId change re-runs ResizeObserver effects with the attached refs.
  act(() => {
    rerender({ ...props, sessionId: `${props.sessionId}-bound` })
  })
  act(() => {
    result.current.scrollContainerRef.current = el
    result.current.contentRef.current = el
    rerender(props)
  })
  act(() => {
    result.current.scrollContainerRef.current = el
    result.current.contentRef.current = el
  })
}

describe('useConversationScroll', () => {
  beforeEach(() => {
    installMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreMocks()
  })

  it('pins to bottom on initial history and follows content growth while attached', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 0, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 0, streaming: true })

    act(() => {
      rerender({ sessionId: 's1', length: 2, streaming: true })
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(360)

    metrics.scrollHeight = 860
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(580)
  })

  it('detaches after the user scrolls up and ignores later content growth and new messages', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 2, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(360)

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -40 } as WheelEvent)
      el.scrollTop = 200
      result.current.handleScroll()
    })

    metrics.scrollHeight = 1200
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(200)

    act(() => {
      rerender({ sessionId: 's1', length: 5, streaming: true })
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(200)
  })

  it('detaches on user scroll-up even inside the programmatic guard window', () => {
    // Mirrors ConversationView: pin to bottom, then user nudges up before 150ms guard ends.
    // Time-only programmatic detection used to swallow this and re-stick on content growth.
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 2, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(360)

    act(() => {
      // Do NOT advance past PROGRAMMATIC_SCROLL_GUARD_MS — only leave the pin target.
      el.scrollTop = 320
      result.current.handleScroll()
    })

    metrics.scrollHeight = 900
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(320)
    expect(result.current.shouldSuppressPositiveScrollCompensation()).toBe(true)
  })

  it('detaches on wheel-up before scroll fires so streaming growth cannot yank back to bottom', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1600 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 8, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 8, streaming: true })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(1600)

    // Wheel-up intent only — no scroll event yet (the race that used to re-stick).
    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -120 } as WheelEvent)
    })

    metrics.scrollHeight = 2600
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()

    // Still near the pre-wheel position; must not jump to the new bottom (2200).
    expect(el.scrollTop).toBe(1600)

    act(() => {
      rerender({ sessionId: 's1', length: 12, streaming: true })
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(1600)
  })

  it('re-attaches when the user scrolls back near the bottom', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 1000, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 2, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true })
    flushAnimationFrames()

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -40 } as WheelEvent)
      el.scrollTop = 100
      result.current.handleScroll()
    })

    // User wheels down then lands near bottom — downward intent re-attaches.
    act(() => {
      result.current.handleWheel({ deltaY: 40 } as WheelEvent)
      el.scrollTop = 860
      result.current.handleScroll()
    })

    metrics.scrollHeight = 1300
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(1020)
  })

  it('stays detached after wheel-up even when streaming growth keeps distanceFromBottom small', () => {
    // Under-estimated virtual totalHeight can make mid-history look near-bottom.
    // Wheel-up must stay detached so ResizeObserver / streaming cannot re-stick.
    const { el, metrics } = createScrollContainer({
      scrollHeight: 500,
      clientHeight: 400,
      scrollTop: 80,
    })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 6, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 6, streaming: true })
    flushAnimationFrames()

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -80 } as WheelEvent)
      // Still "near bottom" after a small upward nudge (false bottom from short spacer).
      el.scrollTop = 60
      result.current.handleScroll()
    })

    const pinnedTop = el.scrollTop
    metrics.scrollHeight = 520
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()

    act(() => {
      rerender({ sessionId: 's1', length: 6, streaming: true })
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(pinnedTop)
  })

  it('on large upward delta: detaches, boosts overscan, syncs metrics, suppresses remeasure compensation', () => {
    // Fast fling path: scrollTop jumps by hundreds of px in one event.
    const { el, metrics } = createScrollContainer({
      scrollHeight: 8000,
      clientHeight: 400,
      scrollTop: 7600,
    })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 40, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 40, streaming: true })
    flushAnimationFrames()

    act(() => {
      vi.advanceTimersByTime(3100)
      // Trackpad fling: large negative wheel before scroll settles.
      result.current.handleWheel({ deltaY: -320 } as WheelEvent)
    })

    expect(result.current.shouldSuppressPositiveScrollCompensation()).toBe(true)
    expect(result.current.scrollMetrics.overscanBoostPx).toBeGreaterThan(0)

    act(() => {
      // One scroll event with a large upward jump (simulates fling sample).
      el.scrollTop = 6200
      result.current.handleScroll()
    })

    // Metrics must update synchronously (not wait for rAF) so virtual window keeps up.
    expect(result.current.scrollMetrics.scrollTop).toBe(6200)
    expect(result.current.scrollMetrics.overscanBoostPx).toBeGreaterThan(0)
    expect(result.current.shouldSuppressPositiveScrollCompensation()).toBe(true)

    const pinned = el.scrollTop
    metrics.scrollHeight = 9000
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    // No rAF stick-to-bottom while flinging up.
    flushAnimationFrames()
    expect(el.scrollTop).toBe(pinned)
  })

  it('resets stick-to-bottom when the session changes', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 2, streaming: false },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: false })
    flushAnimationFrames()

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -40 } as WheelEvent)
      el.scrollTop = 40
      result.current.handleScroll()
    })
    expect(el.scrollTop).toBe(40)

    metrics.scrollHeight = 800
    act(() => {
      rerender({ sessionId: 's2', length: 3, streaming: false })
      result.current.scrollContainerRef.current = el
      result.current.contentRef.current = el
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(520)
  })

  it('re-pins to bottom when liveTailRevision changes without messagesLength growth', () => {
    // Streaming text_delta keeps length stable; without revision stick, the latest
    // tokens can grow below the fold until ResizeObserver catches up.
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook<ReturnType<typeof useConversationScroll>, ScrollHookTestProps>(
      ({ sessionId, length, streaming, liveTailRevision }) => useConversationScroll({
        sessionId,
        messagesLength: length,
        streaming,
        bottomOffset: 96,
        liveTailRevision,
      }),
      {
        initialProps: { sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:10' },
      },
    )

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:10' })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(360)

    metrics.scrollHeight = 900
    act(() => {
      // Content revision only — messagesLength stays 2.
      rerender({ sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:240' })
    })
    flushAnimationFrames()

    expect(el.scrollTop).toBe(620)
  })

  it('does not re-pin on liveTailRevision after the user detaches', () => {
    const { el, metrics } = createScrollContainer({ scrollHeight: 640, clientHeight: 280 })

    const { result, rerender } = renderHook<ReturnType<typeof useConversationScroll>, ScrollHookTestProps>(
      ({ sessionId, length, streaming, liveTailRevision }) => useConversationScroll({
        sessionId,
        messagesLength: length,
        streaming,
        bottomOffset: 96,
        liveTailRevision,
      }),
      {
        initialProps: { sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:10' },
      },
    )

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:10' })
    flushAnimationFrames()

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -40 } as WheelEvent)
      el.scrollTop = 80
      result.current.handleScroll()
    })
    expect(el.scrollTop).toBe(80)

    metrics.scrollHeight = 1000
    act(() => {
      rerender({ sessionId: 's1', length: 2, streaming: true, liveTailRevision: '2:a:400' })
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(80)
  })

  it('stickToBottomNow re-attaches after detach and follows later content growth', () => {
    // Mirrors user-send: had scrolled up to read history, then explicitly sends.
    // Passive message growth must stay detached; stickToBottomNow must re-stick.
    const { el, metrics } = createScrollContainer({ scrollHeight: 1000, clientHeight: 280 })

    const { result, rerender } = renderHook(({ sessionId, length, streaming }) => useConversationScroll({
      sessionId,
      messagesLength: length,
      streaming,
      bottomOffset: 96,
    }), {
      initialProps: { sessionId: 's1', length: 2, streaming: true },
    })

    attachContainer(result, el, rerender, { sessionId: 's1', length: 2, streaming: true })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(720)

    act(() => {
      vi.advanceTimersByTime(3100)
      result.current.handleWheel({ deltaY: -40 } as WheelEvent)
      el.scrollTop = 100
      result.current.handleScroll()
    })
    expect(el.scrollTop).toBe(100)
    expect(result.current.shouldSuppressPositiveScrollCompensation()).toBe(true)

    // Passive new messages while still detached must not pull to bottom.
    act(() => {
      rerender({ sessionId: 's1', length: 4, streaming: true })
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(100)

    // Explicit send re-attach.
    act(() => {
      result.current.stickToBottomNow()
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(720)
    expect(result.current.shouldSuppressPositiveScrollCompensation()).toBe(false)

    // Streaming ResizeObserver growth after re-attach must stick.
    metrics.scrollHeight = 1400
    act(() => {
      resizeObserverInstances.forEach((observer) => observer.trigger())
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(1120)

    // Subsequent message length growth also sticks.
    metrics.scrollHeight = 1600
    act(() => {
      rerender({ sessionId: 's1', length: 5, streaming: true })
    })
    flushAnimationFrames()
    expect(el.scrollTop).toBe(1320)
  })
})
