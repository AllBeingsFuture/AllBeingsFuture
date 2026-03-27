import { describe, expect, it } from 'vitest'
import { buildVirtualLayout } from '../useVirtualizedList'

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
})
