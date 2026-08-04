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
  starts: Map<string, number>
  /** Full key→resolved height for every item (avoids a second resolve pass in the hook). */
  sizes: Map<string, number>
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
  /** Optional: used to preserve visual position when items above the viewport remeasure. */
  getScrollElement?: () => HTMLElement | null
  /** Optional: mark scrollTop writes so stick-to-bottom does not treat them as user intent. */
  markProgrammaticScroll?: (targetScrollTop?: number) => void
  /**
   * Optional: while true, skip positive scrollTop compensation on remeasure.
   * Wired to "user is reading history" (any scroll speed) so remeasure cannot
   * fight upward gestures or pin the viewport after a slow nudge.
   */
  shouldSuppressPositiveScrollCompensation?: () => boolean
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

/**
 * Prefer the last measured size for a key even when content fingerprint changes.
 * Content rewrites fingerprints constantly; discarding measurements caused
 * estimate↔measured thrash and visible scroll jumps. ResizeObserver still pushes
 * the true height when the DOM size actually changes.
 *
 * When a valid measured height exists, trust it over the estimate. Using
 * max(estimate, measured) permanently locked collapsed thinking rows (real ~40px)
 * to content-length estimates of hundreds/thousands of px, inflating totalHeight
 * and leaving huge empty gaps in the virtual list.
 */
function resolveMeasuredSize<T>(
  entry: MeasuredSizeCacheValue | undefined,
  item: T,
  index: number,
  estimatedSize: number,
): { fingerprint: string; size: number } {
  const fingerprint = getItemFingerprint(item, index, estimatedSize)
  const safeEstimate = Math.max(1, estimatedSize)

  if (typeof entry === 'number') {
    const measured = entry > 0 ? entry : safeEstimate
    return { fingerprint, size: measured }
  }

  if (entry && typeof entry.size === 'number' && entry.size > 0) {
    return { fingerprint, size: entry.size }
  }

  return { fingerprint, size: safeEstimate }
}

/**
 * First index whose extent (start + size) reaches `minOffset`.
 * Binary search keeps long conversations O(log n) on the layout hot path.
 */
function findStartIndex(starts: number[], sizes: number[], minOffset: number): number {
  let lo = 0
  let hi = starts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] + sizes[mid] < minOffset) lo = mid + 1
    else hi = mid
  }
  return lo
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
  const startsMap = new Map<string, number>()
  const sizesMap = new Map<string, number>()
  const keys = new Array<string>(items.length)
  const resolvedSizes = new Array<number>(items.length)

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const key = getItemKey(item, index)
    keys[index] = key
    const estimatedSize = estimateSize(item, index)
    const resolved = resolveMeasuredSize(
      measuredSizes?.get(key),
      item,
      index,
      estimatedSize,
    )
    fingerprints.set(key, resolved.fingerprint)
    resolvedSizes[index] = resolved.size
    sizesMap.set(key, resolved.size)
  }

  const starts = new Array<number>(items.length)
  let totalHeight = 0
  for (let index = 0; index < items.length; index += 1) {
    starts[index] = totalHeight
    startsMap.set(keys[index], totalHeight)
    totalHeight += resolvedSizes[index]
  }

  const minOffset = Math.max(0, scrollTop - overscanPx)
  const maxOffset = scrollTop + viewportHeight + overscanPx

  const startIndex = findStartIndex(starts, resolvedSizes, minOffset)

  let endIndex = startIndex
  while (endIndex < items.length) {
    if (starts[endIndex] > maxOffset) break
    endIndex += 1
  }

  const visible: Array<VirtualizedLayoutItem<T>> = []
  for (let index = startIndex; index < endIndex; index += 1) {
    visible.push({
      index,
      item: items[index],
      key: keys[index],
      size: resolvedSizes[index],
      start: starts[index],
    })
  }

  return {
    totalHeight,
    fingerprints,
    starts: startsMap,
    sizes: sizesMap,
    items: visible,
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
  getScrollElement,
  markProgrammaticScroll,
  shouldSuppressPositiveScrollCompensation,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const measuredSizesRef = useRef(new Map<string, MeasuredSizeCacheValue>())
  const observersRef = useRef(new Map<string, ResizeObserver>())
  const measureCallbacksRef = useRef(new Map<string, (node: HTMLElement | null) => void>())
  const itemStartsRef = useRef(new Map<string, number>())
  const itemSizesRef = useRef(new Map<string, number>())
  const fingerprintsRef = useRef(new Map<string, string>())
  const getScrollElementRef = useRef(getScrollElement)
  const markProgrammaticScrollRef = useRef(markProgrammaticScroll)
  const shouldSuppressPositiveScrollCompensationRef = useRef(shouldSuppressPositiveScrollCompensation)
  /** Coalesce ResizeObserver height samples per key to one commit per frame. */
  const pendingResizeHeightsRef = useRef(new Map<string, number>())
  const resizeFlushFrameRef = useRef<number | null>(null)
  const [sizeVersion, setSizeVersion] = useState(0)

  getScrollElementRef.current = getScrollElement
  markProgrammaticScrollRef.current = markProgrammaticScroll
  shouldSuppressPositiveScrollCompensationRef.current = shouldSuppressPositiveScrollCompensation

  useEffect(() => {
    return () => {
      for (const observer of observersRef.current.values()) {
        observer.disconnect()
      }
      observersRef.current.clear()
      measureCallbacksRef.current.clear()
      pendingResizeHeightsRef.current.clear()
      if (resizeFlushFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(resizeFlushFrameRef.current)
        resizeFlushFrameRef.current = null
      }
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

    for (const key of [...measureCallbacksRef.current.keys()]) {
      if (!activeKeys.has(key)) measureCallbacksRef.current.delete(key)
    }
  }, [getItemKey, items])

  const layout = useMemo(() => {
    if (!enabled || items.length === 0 || viewportHeight <= 0) {
      return {
        enabled: false,
        totalHeight: 0,
        fingerprints: new Map<string, string>(),
        starts: new Map<string, number>(),
        sizes: new Map<string, number>(),
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

    // Parent already decided virtualization is worth it. Always keep the spacer
    // + absolute layout path while enabled — flipping to flow layout when the
    // overscan window briefly covers every row caused height jumps and made
    // slow/fast scroll-up feel stuck at the mode boundary.
    // sizes come from buildVirtualLayout (single resolve pass, no double fingerprint).
    return {
      enabled: true,
      totalHeight: nextLayout.totalHeight,
      fingerprints: nextLayout.fingerprints,
      starts: nextLayout.starts,
      sizes: nextLayout.sizes,
      virtualItems: nextLayout.items,
    }
  }, [
    enabled,
    estimateSize,
    getItemKey,
    items,
    overscanPx,
    scrollTop,
    sizeVersion,
    viewportHeight,
  ])

  fingerprintsRef.current = layout.fingerprints
  if (layout.starts.size > 0) {
    itemStartsRef.current = layout.starts
  }
  if (layout.sizes.size > 0) {
    itemSizesRef.current = layout.sizes
  }

  const commitSize = useCallback((key: string, height: number, fingerprint: string) => {
    const normalized = Math.max(1, Math.round(height))
    const existingEntry = measuredSizesRef.current.get(key)
    const cachedSize = typeof existingEntry === 'number'
      ? existingEntry
      : existingEntry?.size
    // First paint after estimate: treat the layout size as previous so fully-above
    // rows can anchor; in-viewport / below rows still skip positive compensation.
    const previousSize = (cachedSize != null && cachedSize > 0)
      ? cachedSize
      : itemSizesRef.current.get(key)

    if (
      typeof existingEntry !== 'number'
      && existingEntry?.fingerprint === fingerprint
      && existingEntry.size === normalized
    ) {
      return
    }

    // Content fingerprint changed but DOM height did not: update cache quietly.
    // Bumping sizeVersion here was a major source of scroll thrash on content churn.
    if (cachedSize === normalized) {
      measuredSizesRef.current.set(key, {
        fingerprint,
        size: normalized,
      })
      return
    }

    measuredSizesRef.current.set(key, {
      fingerprint,
      size: normalized,
    })

    // Preserve visual position only for rows that do not intersect the viewport.
    // Growth: require the row to remain fully above AFTER the new height.
    // Shrink: use the pre-change extent (was fully above).
    // While the user is reading history (any speed), never apply positive
    // compensation — stacked +delta from estimate→measure is the main "滑不上去".
    if (previousSize != null && previousSize > 0) {
      const delta = normalized - previousSize
      const itemStart = itemStartsRef.current.get(key)
      const scrollEl = getScrollElementRef.current?.()
      if (delta !== 0 && scrollEl && itemStart !== undefined) {
        const readingHistory = Boolean(shouldSuppressPositiveScrollCompensationRef.current?.())
        const suppressPositive = delta > 0 && readingHistory
        const fullyAboveAfterGrowth = itemStart + normalized <= scrollEl.scrollTop + 0.5
        const fullyAboveBeforeShrink = itemStart + previousSize <= scrollEl.scrollTop + 0.5
        const shouldCompensate = suppressPositive
          ? false
          : delta > 0
            ? fullyAboveAfterGrowth
            : fullyAboveBeforeShrink
        if (shouldCompensate) {
          const nextScrollTop = scrollEl.scrollTop + delta
          markProgrammaticScrollRef.current?.(nextScrollTop)
          scrollEl.scrollTop = nextScrollTop
        }
      }
    }

    itemSizesRef.current.set(key, normalized)
    setSizeVersion((version) => version + 1)
  }, [])

  const flushPendingResizeHeights = useCallback(() => {
    resizeFlushFrameRef.current = null
    const pending = pendingResizeHeightsRef.current
    if (pending.size === 0) return
    const batch = [...pending.entries()]
    pending.clear()
    for (const [key, height] of batch) {
      const fingerprint = fingerprintsRef.current.get(key) ?? ''
      commitSize(key, height, fingerprint)
    }
  }, [commitSize])

  const scheduleResizeCommit = useCallback((key: string, height: number) => {
    pendingResizeHeightsRef.current.set(key, height)
    if (typeof requestAnimationFrame !== 'function') {
      flushPendingResizeHeights()
      return
    }
    if (resizeFlushFrameRef.current !== null) return
    resizeFlushFrameRef.current = requestAnimationFrame(() => {
      flushPendingResizeHeights()
    })
  }, [flushPendingResizeHeights])

  const measureElement = useCallback((key: string) => {
    let callback = measureCallbacksRef.current.get(key)
    if (!callback) {
      callback = (node: HTMLElement | null) => {
        const existingObserver = observersRef.current.get(key)
        if (!node) {
          existingObserver?.disconnect()
          observersRef.current.delete(key)
          pendingResizeHeightsRef.current.delete(key)
          return
        }

        const fingerprint = fingerprintsRef.current.get(key) ?? ''
        // First paint: commit synchronously so layout/tests see the measured size
        // without waiting for a frame. Subsequent RO samples are rAF-coalesced.
        commitSize(key, node.getBoundingClientRect().height, fingerprintsRef.current.get(key) ?? fingerprint)

        if (typeof ResizeObserver === 'undefined') return

        existingObserver?.disconnect()
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          scheduleResizeCommit(key, entry.contentRect.height)
        })
        observer.observe(node)
        observersRef.current.set(key, observer)
      }
      measureCallbacksRef.current.set(key, callback)
    }
    return callback
  }, [commitSize, scheduleResizeCommit])

  return {
    enabled: layout.enabled,
    totalHeight: layout.enabled ? layout.totalHeight : 0,
    virtualItems: layout.virtualItems,
    measureElement,
  }
}
