import { act, renderHook } from '../../../test/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildVirtualLayout, useVirtualizedList } from '../useVirtualizedList'

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

  disconnect() {
    this.targets.clear()
  }

  trigger(target?: Element) {
    const entries = [...this.targets]
      .filter((candidate) => !target || candidate === target)
      .map((candidate) => ({
        target: candidate,
        contentRect: candidate.getBoundingClientRect(),
      })) as ResizeObserverEntry[]

    if (entries.length === 0) return
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

function installResizeObserverMock() {
  resizeObserverInstances.length = 0
  animationFrameId = 0
  animationFrameQueue = new Map()
  ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
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

function flushAnimationFrames(iterations = 2) {
  for (let index = 0; index < iterations; index += 1) {
    const queued = [...animationFrameQueue.values()]
    animationFrameQueue.clear()
    if (queued.length === 0) return
    act(() => {
      queued.forEach((callback) => callback(performance.now()))
    })
  }
}

function restoreResizeObserverMock() {
  resizeObserverInstances.length = 0
  animationFrameQueue.clear()
  if (originalResizeObserver) {
    ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = originalResizeObserver
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

function createFakeNode(height: number) {
  const node = {
    __height: height,
    getBoundingClientRect() {
      return {
        width: 0,
        height: node.__height,
        top: 0,
        right: 0,
        bottom: node.__height,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    },
  }

  return node as HTMLElement & { __height: number }
}

function makeItems(version: string) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `item-${index}`,
    version,
    label: `${version}-${index}`,
    size: 50,
  }))
}

describe('buildVirtualLayout', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `item-${index}`,
    size: 100,
  }))

  it('returns only the overscanned visible window', () => {
    const layout = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 50,
      scrollTop: 250,
      viewportHeight: 200,
    })

    expect(layout.totalHeight).toBe(1000)
    expect(layout.items.map((item) => item.key)).toEqual([
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
    ])
    expect(layout.items[0]?.start).toBe(100)
    expect(layout.items[layout.items.length - 1]?.start).toBe(500)
  })

  it('prefers measured sizes when available', () => {
    const measured = new Map<string, number>([['item-2', 180]])
    const layout = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      measuredSizes: measured,
      overscanPx: 0,
      scrollTop: 200,
      viewportHeight: 220,
    })

    expect(layout.totalHeight).toBe(1080)
    expect(layout.items.map((item) => `${item.key}:${item.start}`)).toEqual([
      'item-1:100',
      'item-2:200',
      'item-3:380',
    ])
  })

  it('keeps last measured size when the content fingerprint changes under the same key', () => {
    // Streaming rewrites fingerprints constantly; discarding measured heights caused
    // estimate↔measured thrash and visible jumps while reading history.
    const measured = new Map([
      ['item-2', { size: 180, fingerprint: 'stale-dataset' }],
    ])
    const layout = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      measuredSizes: measured,
      overscanPx: 0,
      scrollTop: 200,
      viewportHeight: 220,
    })

    expect(layout.totalHeight).toBe(1080)
    expect(layout.items.map((item) => `${item.key}:${item.start}`)).toEqual([
      'item-1:100',
      'item-2:200',
      'item-3:380',
    ])
  })

  it('uses measured size when available even if smaller than estimate', () => {
    // Collapsed thinking is ~40px while content-length estimates can be 100s–1000s.
    // Trusting max(estimate, measured) permanently inflated totalHeight and left gaps.
    const measured = new Map<string, number>([['item-0', 40]])
    const layout = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size, // 100 > measured 40
      measuredSizes: measured,
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 200,
    })

    // 40 + 9*100 = 940 — measured wins over a larger estimate.
    expect(layout.totalHeight).toBe(940)
    expect(layout.items[0]?.size).toBe(40)
  })
})

describe('useVirtualizedList', () => {
  beforeEach(() => {
    installResizeObserverMock()
  })

  afterEach(() => {
    restoreResizeObserverMock()
  })

  it('keeps measured sizes across content fingerprint changes until the DOM is remeasured', () => {
    const { result, rerender } = renderHook(({ items }) => useVirtualizedList({
      items,
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 60,
    }), {
      initialProps: { items: makeItems('session-a') },
    })

    const firstNode = createFakeNode(120)
    const secondNode = createFakeNode(130)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
      result.current.measureElement('item-1')(secondNode)
    })

    expect(result.current.totalHeight).toBe(400)

    // Same keys, different content fingerprints — sticky measurements prevent thrash.
    rerender({ items: makeItems('session-b') })
    expect(result.current.totalHeight).toBe(400)

    // Keys leaving the list still clears the cache (session switch with new key space).
    rerender({
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `other-${index}`,
        version: 'session-c',
        label: `session-c-${index}`,
        size: 50,
      })),
    })
    expect(result.current.totalHeight).toBe(250)
  })

  it('compensates scrollTop when an item fully above the viewport is remeasured taller', () => {
    const scrollElement = {
      scrollTop: 200,
    }

    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 200,
      viewportHeight: 60,
      getScrollElement: () => scrollElement as HTMLElement,
    }))

    const firstNode = createFakeNode(50)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    // item-0 spans [0, 50], fully above scrollTop 200; growing it should push scrollTop.
    act(() => {
      firstNode.__height = 120
      resizeObserverInstances[0]?.trigger(firstNode as unknown as Element)
    })
    flushAnimationFrames()

    expect(scrollElement.scrollTop).toBe(270)
    expect(result.current.totalHeight).toBe(320)
  })

  it('grows layout height with estimate for streaming partial items before RO catches up', () => {
    type Row = { id: string; size: number; partial?: boolean; content: string }
    const { result, rerender } = renderHook(({ items }) => useVirtualizedList({
      items,
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 200,
      shouldPreferGrowingEstimate: (item) => Boolean(item.partial),
    }), {
      initialProps: {
        items: [
          { id: 'a', size: 80, partial: true, content: 'hi' },
          { id: 'b', size: 50, content: 'done' },
        ] as Row[],
      },
    })

    const node = createFakeNode(80)
    act(() => {
      result.current.measureElement('a')(node)
    })
    expect(result.current.totalHeight).toBe(130)

    // Content estimate grows while measured cache still holds 80 — spacer follows max.
    rerender({
      items: [
        { id: 'a', size: 160, partial: true, content: 'hi there longer' },
        { id: 'b', size: 50, content: 'done' },
      ],
    })
    expect(result.current.totalHeight).toBe(210)

    // Completed (non-partial) keeps sticky measured size even if estimate is larger.
    rerender({
      items: [
        { id: 'a', size: 300, partial: false, content: 'finalized long body' },
        { id: 'b', size: 50, content: 'done' },
      ],
    })
    expect(result.current.totalHeight).toBe(130)
  })

  it('coalesces multiple ResizeObserver samples into one commit per animation frame', () => {
    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 60,
    }))

    const node = createFakeNode(50)
    act(() => {
      result.current.measureElement('item-0')(node)
    })
    expect(result.current.totalHeight).toBe(250)

    act(() => {
      node.__height = 70
      resizeObserverInstances[0]?.trigger(node as unknown as Element)
      node.__height = 90
      resizeObserverInstances[0]?.trigger(node as unknown as Element)
      node.__height = 110
      resizeObserverInstances[0]?.trigger(node as unknown as Element)
    })
    // Not applied until rAF flush — still first measured height.
    expect(result.current.totalHeight).toBe(250)

    flushAnimationFrames()
    expect(result.current.totalHeight).toBe(310)
  })

  it('does not compensate scrollTop when a partially visible item is remeasured taller', () => {
    const scrollElement = {
      scrollTop: 40,
    }

    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 40,
      viewportHeight: 60,
      getScrollElement: () => scrollElement as HTMLElement,
    }))

    const firstNode = createFakeNode(50)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    // item-0 spans [0, 50] and intersects the viewport starting at 40 — do not fight scroll-up.
    act(() => {
      firstNode.__height = 120
      resizeObserverInstances[0]?.trigger(firstNode as unknown as Element)
    })
    flushAnimationFrames()

    expect(scrollElement.scrollTop).toBe(40)
    expect(result.current.totalHeight).toBe(320)
  })

  it('does not apply positive compensation when growth would enter the viewport', () => {
    // Under-estimated previous height ends at 50 (<= scrollTop 80) so the old
    // "fully above" check would wrongly bump scrollTop while the user scrolls up.
    const scrollElement = {
      scrollTop: 80,
    }
    const markProgrammaticScroll = vi.fn()

    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 80,
      viewportHeight: 60,
      getScrollElement: () => scrollElement as HTMLElement,
      markProgrammaticScroll,
    }))

    const firstNode = createFakeNode(50)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    act(() => {
      // Grows from [0,50] into [0,150], intersecting viewport at scrollTop 80.
      firstNode.__height = 150
      resizeObserverInstances[0]?.trigger(firstNode as unknown as Element)
    })
    flushAnimationFrames()

    expect(scrollElement.scrollTop).toBe(80)
    expect(markProgrammaticScroll).not.toHaveBeenCalled()
    expect(result.current.totalHeight).toBe(350)
  })

  it('compensates first measure above the viewport and marks it programmatic', () => {
    const scrollElement = {
      scrollTop: 200,
    }
    const markProgrammaticScroll = vi.fn()

    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 200,
      viewportHeight: 60,
      getScrollElement: () => scrollElement as HTMLElement,
      markProgrammaticScroll,
    }))

    // First paint: layout used estimate 50; real height 90 stays fully above 200.
    const firstNode = createFakeNode(90)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    expect(scrollElement.scrollTop).toBe(240)
    expect(markProgrammaticScroll).toHaveBeenCalled()
    expect(result.current.totalHeight).toBe(290)
  })

  it('skips positive scrollTop compensation during fast upward fling suppress window', () => {
    const scrollElement = {
      scrollTop: 200,
    }

    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 200,
      viewportHeight: 60,
      getScrollElement: () => scrollElement as HTMLElement,
      shouldSuppressPositiveScrollCompensation: () => true,
    }))

    const firstNode = createFakeNode(50)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    // Fully above and growing — would normally +70 scrollTop; fling suppress blocks it.
    act(() => {
      firstNode.__height = 120
      resizeObserverInstances[0]?.trigger(firstNode as unknown as Element)
    })
    flushAnimationFrames()

    expect(scrollElement.scrollTop).toBe(200)
    expect(result.current.totalHeight).toBe(320)
  })

  it('includes farther items when overscan is large (fast-scroll window)', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `item-${index}`,
      size: 100,
    }))

    const tight = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 2000,
      viewportHeight: 200,
    })

    const wide = buildVirtualLayout({
      items,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 1800,
      scrollTop: 2000,
      viewportHeight: 200,
    })

    expect(tight.items[0]?.index).toBeGreaterThan(wide.items[0]?.index ?? 0)
    expect(wide.items.length).toBeGreaterThan(tight.items.length)
    // Wide overscan still covers the viewport center around scrollTop 2000.
    expect(wide.items.some((item) => item.start <= 2000 && item.start + item.size >= 2000)).toBe(true)
  })

  it('does not bump layout when only the content fingerprint changes at the same height', () => {
    const { result, rerender } = renderHook(({ items, scrollTop }) => useVirtualizedList({
      items,
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop,
      viewportHeight: 60,
    }), {
      initialProps: { items: makeItems('token-1'), scrollTop: 0 },
    })

    const node = createFakeNode(120)
    act(() => {
      result.current.measureElement('item-0')(node)
    })

    const heightAfterMeasure = result.current.totalHeight
    expect(heightAfterMeasure).toBe(320)

    // Stable measure callback identity across rerenders avoids ref thrash.
    const firstCallback = result.current.measureElement('item-0')
    rerender({ items: makeItems('token-2'), scrollTop: 0 })
    const secondCallback = result.current.measureElement('item-0')
    expect(secondCallback).toBe(firstCallback)

    act(() => {
      // Re-attach with same pixel height after fingerprint change.
      secondCallback(node)
    })

    expect(result.current.totalHeight).toBe(heightAfterMeasure)
  })

  it('recomputes offsets when ResizeObserver reports a height change during streaming', () => {
    const { result } = renderHook(() => useVirtualizedList({
      items: makeItems('stream'),
      enabled: true,
      getItemKey: (item) => item.id,
      estimateSize: (item) => item.size,
      overscanPx: 0,
      scrollTop: 0,
      viewportHeight: 260,
    }))

    const firstNode = createFakeNode(120)

    act(() => {
      result.current.measureElement('item-0')(firstNode)
    })

    expect(result.current.totalHeight).toBe(320)
    expect(result.current.virtualItems.find((item) => item.key === 'item-1')?.start).toBe(120)

    act(() => {
      firstNode.__height = 180
      resizeObserverInstances[0]?.trigger(firstNode as unknown as Element)
    })
    flushAnimationFrames()

    expect(result.current.totalHeight).toBe(380)
    expect(result.current.virtualItems.find((item) => item.key === 'item-1')?.start).toBe(180)
  })
})
