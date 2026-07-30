import type { AgentStreamEvent } from '../../types/agentStreamTypes'

export type AgentStreamBatchScheduleHandle = unknown

export type AgentStreamBatchSchedule = (
  flush: () => void,
) => AgentStreamBatchScheduleHandle

export type AgentStreamBatchCancelSchedule = (
  handle: AgentStreamBatchScheduleHandle,
) => void

export interface AgentStreamBatcherOptions {
  onFlush: (sessionId: string, events: AgentStreamEvent[]) => void
  schedule?: AgentStreamBatchSchedule
  cancelSchedule?: AgentStreamBatchCancelSchedule
}

export interface AgentStreamBatcher {
  push(event: AgentStreamEvent): void
  flush(sessionId?: string): void
  dispose(): void
}

/**
 * Events that can wait for the next animation frame before reducing into the store.
 *
 * ~1 store update per display frame is intentional: further coalescing would add
 * visible latency without a smoother UI (paint already caps at display refresh).
 * Tool / terminal events still flush immediately via push().
 */
export function isBatchableAgentStreamEvent(event: AgentStreamEvent): boolean {
  if (event.type === 'text_delta') return true
  if (event.type === 'thinking_update') {
    // replace must land immediately so partial thinking is not merged incorrectly
    return event.mode !== 'replace'
  }
  return false
}

/**
 * Merge consecutive same-session+itemId text/thinking deltas.
 * lastSequence contract: coalesced event.sequence is the last real event's sequence.
 * Only merges strictly increasing sequences so replay/duplicate events stay separate
 * for reduceAgentStreamEvent to ignore.
 */
export function coalesceAgentStreamEvents(events: AgentStreamEvent[]): AgentStreamEvent[] {
  if (events.length <= 1) return events

  const out: AgentStreamEvent[] = []
  for (const event of events) {
    const prev = out[out.length - 1]
    if (
      prev
      && prev.type === 'text_delta'
      && event.type === 'text_delta'
      && prev.sessionId === event.sessionId
      && prev.itemId === event.itemId
      && event.sequence > prev.sequence
    ) {
      out[out.length - 1] = {
        ...event,
        delta: `${prev.delta}${event.delta}`,
      }
      continue
    }
    if (
      prev
      && prev.type === 'thinking_update'
      && event.type === 'thinking_update'
      && prev.sessionId === event.sessionId
      && prev.itemId === event.itemId
      && prev.mode !== 'replace'
      && event.mode !== 'replace'
      && event.sequence > prev.sequence
    ) {
      out[out.length - 1] = {
        ...event,
        text: `${prev.text}${event.text}`,
      }
      continue
    }
    out.push(event)
  }
  return out
}

function defaultSchedule(flush: () => void): AgentStreamBatchScheduleHandle {
  if (typeof requestAnimationFrame === 'function') {
    return { kind: 'raf' as const, id: requestAnimationFrame(flush) }
  }
  if (typeof queueMicrotask === 'function') {
    const token = { cancelled: false }
    queueMicrotask(() => {
      if (!token.cancelled) flush()
    })
    return { kind: 'micro' as const, token }
  }
  return { kind: 'timeout' as const, id: setTimeout(flush, 0) }
}

function defaultCancelSchedule(handle: AgentStreamBatchScheduleHandle): void {
  if (!handle || typeof handle !== 'object') return
  const h = handle as { kind?: string; id?: number | ReturnType<typeof setTimeout>; token?: { cancelled: boolean } }
  if (h.kind === 'raf' && typeof h.id === 'number' && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(h.id)
    return
  }
  if (h.kind === 'micro' && h.token) {
    h.token.cancelled = true
    return
  }
  if (h.kind === 'timeout' && h.id !== undefined) {
    clearTimeout(h.id as ReturnType<typeof setTimeout>)
  }
}

export function createAgentStreamBatcher(options: AgentStreamBatcherOptions): AgentStreamBatcher {
  const schedule = options.schedule ?? defaultSchedule
  const cancelSchedule = options.cancelSchedule ?? defaultCancelSchedule
  const pending = new Map<string, AgentStreamEvent[]>()
  const scheduled = new Map<string, AgentStreamBatchScheduleHandle>()
  let disposed = false

  const clearSchedule = (sessionId: string) => {
    const handle = scheduled.get(sessionId)
    if (handle !== undefined) {
      cancelSchedule(handle)
      scheduled.delete(sessionId)
    }
  }

  const flushSession = (sessionId: string) => {
    clearSchedule(sessionId)
    const events = pending.get(sessionId)
    if (!events || events.length === 0) {
      pending.delete(sessionId)
      return
    }
    pending.delete(sessionId)
    const coalesced = coalesceAgentStreamEvents(events)
    options.onFlush(sessionId, coalesced)
  }

  return {
    push(event: AgentStreamEvent) {
      if (disposed) return
      const sessionId = event.sessionId
      const queue = pending.get(sessionId)
      if (queue) {
        queue.push(event)
      } else {
        pending.set(sessionId, [event])
      }

      if (!isBatchableAgentStreamEvent(event)) {
        flushSession(sessionId)
        return
      }

      if (!scheduled.has(sessionId)) {
        const handle = schedule(() => {
          if (disposed) return
          scheduled.delete(sessionId)
          flushSession(sessionId)
        })
        scheduled.set(sessionId, handle)
      }
    },

    flush(sessionId?: string) {
      if (disposed) return
      if (sessionId !== undefined) {
        flushSession(sessionId)
        return
      }
      for (const id of [...pending.keys()]) {
        flushSession(id)
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const id of scheduled.keys()) {
        clearSchedule(id)
      }
      pending.clear()
    },
  }
}
