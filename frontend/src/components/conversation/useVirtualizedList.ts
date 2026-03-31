import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const MAX_FINGERPRINT_DEPTH = 2
const MAX_FINGERPRINT_KEYS = 8
const MAX_FINGERPRINT_ITEMS = 2
const MAX_FINGERPRINT_STRING_SAMPLE = 24
const PRIORITY_FINGERPRINT_KEYS = [
  'id',
  'sessionId',
  'childSessionId',
  'type',
  'role',
  'toolName',
  'content',
  'index',
  'timestamp',
  'name',
] as const

export interface VirtualizedLayoutItem<T> {
  index: number
  item: T
  key: string
  size: number
  start: number
}

interface MeasuredSizeEntry {
  fingerprint: string
  size: number
}

type MeasuredSizeCacheValue = number | MeasuredSizeEntry

interface VirtualizedLayout<T> {
  totalHeight: number
  items: Array<VirtualizedLayoutItem<T>>
  fingerprints: Map<string, string>
}

export interface BuildVirtualLayoutOptions<T> {
  items: T[]
  getItemKey: (item: T, index: number) => string
  estimateSize: (item: T, index: number) => number
  measuredSizes?: Map<string, MeasuredSizeCacheValue>
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

function summarizeFingerprintString(value: string): string {
  if (value.length <= MAX_FINGERPRINT_STRING_SAMPLE) return value
  return `${value.length}:${value.slice(0, MAX_FINGERPRINT_STRING_SAMPLE)}:${value.slice(-MAX_FINGERPRINT_STRING_SAMPLE)}`
}

function pickFingerprintKeys(record: Record<string, unknown>): string[] {
  const keys = Object.keys(record)
  const prioritized = PRIORITY_FINGERPRINT_KEYS.filter((key) => keys.includes(key))
  const prioritizedSet = new Set<string>(prioritized)
  const remaining = keys.filter((key) => !prioritizedSet.has(key)).sort()
  return [...prioritized, ...remaining].slice(0, MAX_FINGERPRINT_KEYS)
}

function fingerprintValue(value: unknown, depth: number, seen: WeakSet<object>): string {
  if (value == null) return String(value)

  if (typeof value === 'string') return `str(${summarizeFingerprintString(value)})`
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${typeof value}(${String(value)})`
  if (typeof value === 'function') return `fn(${value.name || 'anonymous'})`

  if (value instanceof Date) return `date(${value.toISOString()})`

  if (Array.isArray(value)) {
    if (seen.has(value)) return `arr(${value.length}):circular`
    seen.add(value)

    if (depth >= MAX_FINGERPRINT_DEPTH) {
      seen.delete(value)
      return `arr(${value.length})`
    }

    const head = value
      .slice(0, MAX_FINGERPRINT_ITEMS)
      .map((item) => fingerprintValue(item, depth + 1, seen))
    const tailStart = Math.max(MAX_FINGERPRINT_ITEMS, value.length - MAX_FINGERPRINT_ITEMS)
    const tail = value
      .slice(tailStart)
      .map((item) => fingerprintValue(item, depth + 1, seen))

    seen.delete(value)
    return `arr(${value.length})[${head.join(',')}][${tail.join(',')}]`
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (seen.has(record)) return 'circular'
    seen.add(record)

    if (depth >= MAX_FINGERPRINT_DEPTH) {
      seen.delete(record)
      return `obj(${pickFingerprintKeys(record).join(',')})`
    }

    const body = pickFingerprintKeys(record)
      .map((key) => `${key}:${fingerprintValue(record[key], depth + 1, seen)}`)
      .join('|')

    seen.delete(record)
    return `obj(${body})`
  }

  return typeof value
}

function getItemFingerprint(item: unknown, index: number, estimatedSize: number): string {
  return `${index}:${estimatedSize}:${fingerprintValue(item, 0, new WeakSet<object>())}`
}

function resolveMeasuredSize<T>(
  entry: MeasuredSizeCacheValue | undefined,
  item: T,
  index: number,
  estimatedSize: number,
): { fingerprint: string; size: number } {
  const fingerprint = getItemFingerprint(item, index, estimatedSize)
  if (typeof entry === 'number') {
    return { fingerprint, size: entry }
  }

  if (entry?.fingerprint === fingerprint) {
    return { fingerprint, size: entry.size }
  }

  return { fingerprint, size: estimatedSize }
}

export function buildVirtualLayout<T>({
  items,
  getItemKey,
  estimateSize,
  measuredSizes,
  overscanPx,
  scrollTop,
  viewportHeight,
}: BuildVirtualLayoutOptions<T>): VirtualizedLayout<T> {
  const fingerprints = new Map<string, string>()
  const resolvedSizes = items.map((item, index) => {
    const key = getItemKey(item, index)
    const estimatedSize = estimateSize(item, index)
    const resolved = resolveMeasuredSize(measuredSizes?.get(key), item, index, estimatedSize)
    fingerprints.set(key, resolved.fingerprint)
    return resolved.size
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
    fingerprints,
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
  const measuredSizesRef = useRef(new Map<string, MeasuredSizeCacheValue>())
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

  useEffect(() => {
    const activeKeys = new Set(items.map((item, index) => getItemKey(item, index)))

    for (const key of [...measuredSizesRef.current.keys()]) {
      if (!activeKeys.has(key)) measuredSizesRef.current.delete(key)
    }

    for (const [key, observer] of observersRef.current.entries()) {
      if (activeKeys.has(key)) continue
      observer.disconnect()
      observersRef.current.delete(key)
    }
  }, [getItemKey, items])

  const layout = useMemo(() => {
    if (!enabled || items.length === 0 || viewportHeight <= 0) {
      return {
        enabled: false,
        totalHeight: 0,
        fingerprints: new Map<string, string>(),
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
      fingerprints: nextLayout.fingerprints,
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

  const measureElement = useCallback((key: string) => {
    const fingerprint = layout.fingerprints.get(key) ?? ''

    return (node: HTMLElement | null) => {
      const existingObserver = observersRef.current.get(key)
      if (!node) {
        existingObserver?.disconnect()
        observersRef.current.delete(key)
        return
      }

      const commitSize = (height: number) => {
        const normalized = Math.max(1, Math.round(height))
        const existingEntry = measuredSizesRef.current.get(key)
        if (
          typeof existingEntry !== 'number'
          && existingEntry?.fingerprint === fingerprint
          && existingEntry.size === normalized
        ) {
          return
        }

        measuredSizesRef.current.set(key, {
          fingerprint,
          size: normalized,
        })
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
    }
  }, [layout.fingerprints])

  return {
    enabled: layout.enabled,
    totalHeight: layout.enabled ? layout.totalHeight : 0,
    virtualItems: layout.virtualItems,
    measureElement,
  }
}
