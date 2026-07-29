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

/** Attach container and re-bind observers via a session change after the ref is set. */
function attachContainer(
  result: { current: ReturnType<typeof useConversationScroll> },
  el: HTMLDivElement,
  rerender: (props: { sessionId: string; length: number; streaming: boolean }) => void,
  props: { sessionId: string; length: number; streaming: boolean },
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
      result.current.handleWheel()
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
      result.current.handleWheel()
      el.scrollTop = 100
      result.current.handleScroll()
    })

    // Near-bottom: distance = 1000 - 860 - 280 = -140 → clamped conceptually as near.
    act(() => {
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
      result.current.handleWheel()
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
})
