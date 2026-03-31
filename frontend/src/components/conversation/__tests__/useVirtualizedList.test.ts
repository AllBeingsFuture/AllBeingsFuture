import { act, renderHook } from '../../../test/render'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildVirtualLayout, useVirtualizedList } from '../useVirtualizedList'

const originalResizeObserver = globalThis.ResizeObserver
const resizeObserverInstances: MockResizeObserver[] = []

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
  ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
}

function restoreResizeObserverMock() {
  resizeObserverInstances.length = 0
  if (originalResizeObserver) {
    ;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = originalResizeObserver
    return
  }

  Reflect.deleteProperty(globalThis, 'ResizeObserver')
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

  it('ignores stale measured entries when the dataset changes under the same key', () => {
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

    expect(layout.totalHeight).toBe(1000)
    expect(layout.items.map((item) => `${item.key}:${item.start}`)).toEqual([
      'item-1:100',
      'item-2:200',
      'item-3:300',
      'item-4:400',
    ])
  })
})

describe('useVirtualizedList', () => {
  beforeEach(() => {
    installResizeObserverMock()
  })

  afterEach(() => {
    restoreResizeObserverMock()
  })

  it('does not reuse measured sizes when a new dataset reuses the same item keys', () => {
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

    rerender({ items: makeItems('session-b') })

    expect(result.current.totalHeight).toBe(250)
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

    expect(result.current.totalHeight).toBe(380)
    expect(result.current.virtualItems.find((item) => item.key === 'item-1')?.start).toBe(180)
  })
})
