import { describe, expect, it } from 'vitest'
import { buildVirtualLayout, syncMeasurementCache } from '../useVirtualizedList'

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

describe('syncMeasurementCache', () => {
  it('drops cached sizes when an item reuses a key but its signature changes', () => {
    const measured = new Map<string, number>([['key-0', 80]])
    const previousSignatures = new Map<string, string | null>([['key-0', 'sig-a']])
    const nextSignatures = syncMeasurementCache(
      [{ id: 'key-0' }],
      (item) => item.id,
      measured,
      previousSignatures,
      () => 'sig-b',
    )

    expect(measured.has('key-0')).toBe(false)
    expect(nextSignatures.get('key-0')).toBe('sig-b')
  })

  it('retains cached sizes when signatures remain the same', () => {
    const measured = new Map<string, number>([['key-0', 55]])
    const previousSignatures = new Map<string, string | null>([['key-0', 'stable']])
    const nextSignatures = syncMeasurementCache(
      [{ id: 'key-0' }],
      (item) => item.id,
      measured,
      previousSignatures,
      () => 'stable',
    )

    expect(measured.has('key-0')).toBe(true)
    expect(nextSignatures.get('key-0')).toBe('stable')
  })

  it('clears cache entries that no longer exist in the current item set', () => {
    const measured = new Map<string, number>([['key-0', 33]])
    const previousSignatures = new Map<string, string | null>([['key-0', 'sig']])
    const nextSignatures = syncMeasurementCache(
      [],
      () => 'key-0',
      measured,
      previousSignatures,
      () => null,
    )

    expect(measured.has('key-0')).toBe(false)
    expect(nextSignatures.size).toBe(0)
  })
})
