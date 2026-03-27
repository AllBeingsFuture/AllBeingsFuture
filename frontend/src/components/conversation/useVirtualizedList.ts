import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface VirtualizedLayoutItem<T> {
  index: number
  item: T
  key: string
  size: number
  start: number
}

export interface BuildVirtualLayoutOptions<T> {
  items: T[]
  getItemKey: (item: T, index: number) => string
  estimateSize: (item: T, index: number) => number
  measuredSizes?: Map<string, number>
  overscanPx: number
  scrollTop: number
  viewportHeight: number
}

export interface VirtualizedListOptions<T> extends Omit<BuildVirtualLayoutOptions<T>, 'measuredSizes'> {
  enabled: boolean
}

export interface VirtualizedListResult<T> {
  enabled: boolean
  totalHeight: number
  virtualItems: Array<VirtualizedLayoutItem<T>>
  measureElement: (key: string) => (node: HTMLElement | null) => void
}

export function buildVirtualLayout<T>({
  items,
  getItemKey,
  estimateSize,
  measuredSizes,
  overscanPx,
  scrollTop,
  viewportHeight,
}: BuildVirtualLayoutOptions<T>): { totalHeight: number; items: Array<VirtualizedLayoutItem<T>> } {
  const resolvedSizes = items.map((item, index) => {
    const key = getItemKey(item, index)
    return measuredSizes?.get(key) ?? estimateSize(item, index)
  })

  const starts = new Array<number>(items.length)
  let totalHeight = 0
  for (let index = 0; index < items.length; index += 1) {
    starts[index] = totalHeight
    totalHeight += resolvedSizes[index]
  }

  const minOffset = Math.max(0, scrollTop - overscanPx)
  const maxOffset = scrollTop + viewportHeight + overscanPx

  let startIndex = 0
  while (startIndex < items.length) {
    const end = starts[startIndex] + resolvedSizes[startIndex]
    if (end >= minOffset) break
    startIndex += 1
  }

  let endIndex = startIndex
  while (endIndex < items.length) {
    if (starts[endIndex] > maxOffset) break
    endIndex += 1
  }

  return {
    totalHeight,
    items: items.slice(startIndex, endIndex).map((item, relativeIndex) => {
      const index = startIndex + relativeIndex
      return {
        index,
        item,
        key: getItemKey(item, index),
        size: resolvedSizes[index],
        start: starts[index],
      }
    }),
  }
}

export function useVirtualizedList<T>({
  items,
  enabled,
  getItemKey,
  estimateSize,
  overscanPx,
  scrollTop,
  viewportHeight,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const measuredSizesRef = useRef(new Map<string, number>())
  const observersRef = useRef(new Map<string, ResizeObserver>())
  const [sizeVersion, setSizeVersion] = useState(0)

  useEffect(() => {
    return () => {
      for (const observer of observersRef.current.values()) {
        observer.disconnect()
      }
      observersRef.current.clear()
    }
  }, [])

  const layout = useMemo(() => {
    if (!enabled || items.length === 0 || viewportHeight <= 0) {
      return {
        enabled: false,
        totalHeight: 0,
        virtualItems: items.map((item, index) => ({
          index,
          item,
          key: getItemKey(item, index),
          size: estimateSize(item, index),
          start: 0,
        })),
      }
    }

    const nextLayout = buildVirtualLayout({
      items,
      getItemKey,
      estimateSize,
      measuredSizes: measuredSizesRef.current,
      overscanPx,
      scrollTop,
      viewportHeight,
    })

    // Fallback to full rendering when virtualization would not remove enough work.
    const shouldVirtualize = nextLayout.items.length < items.length
    return {
      enabled: shouldVirtualize,
      totalHeight: nextLayout.totalHeight,
      virtualItems: shouldVirtualize
        ? nextLayout.items
        : items.map((item, index) => ({
            index,
            item,
            key: getItemKey(item, index),
            size: estimateSize(item, index),
            start: 0,
          })),
    }
  }, [enabled, estimateSize, getItemKey, items, overscanPx, scrollTop, sizeVersion, viewportHeight])

  const measureElement = useCallback((key: string) => (node: HTMLElement | null) => {
    const existingObserver = observersRef.current.get(key)
    if (!node) {
      existingObserver?.disconnect()
      observersRef.current.delete(key)
      return
    }

    const commitSize = (height: number) => {
      const normalized = Math.max(1, Math.round(height))
      if (measuredSizesRef.current.get(key) === normalized) return
      measuredSizesRef.current.set(key, normalized)
      setSizeVersion((version) => version + 1)
    }

    commitSize(node.getBoundingClientRect().height)

    if (typeof ResizeObserver === 'undefined') return

    existingObserver?.disconnect()
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      commitSize(entry.contentRect.height)
    })
    observer.observe(node)
    observersRef.current.set(key, observer)
  }, [])

  return {
    enabled: layout.enabled,
    totalHeight: layout.enabled ? layout.totalHeight : 0,
    virtualItems: layout.virtualItems,
    measureElement,
  }
}
