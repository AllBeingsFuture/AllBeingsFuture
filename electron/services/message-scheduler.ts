/**
 * MessageScheduler - Per-session message dispatch strategy
 *
 * Ported from SpectrAI SessionManagerV2's scheduling pattern.
 * When a session is currently running (streaming a response), incoming
 * messages are queued and dispatched after the current turn completes.
 *
 * Two dispatch modes:
 * - `immediate`        — send right away (session is idle)
 * - `queue_after_turn` — queue message, send when current turn completes
 */

export type DispatchStrategy = 'immediate' | 'queue_after_turn'

export interface ScheduledMessage {
  id: string
  text: string
  queuedAt: string
  strategy: DispatchStrategy
  images?: Array<{ data: string; mimeType: string }>
}

export interface DispatchResult {
  dispatched: boolean
  scheduled: boolean
  strategy: DispatchStrategy
  queueLength: number
  reason?: string
}

const MAX_PENDING_PER_SESSION = 20

/**
 * MessageScheduler manages message queuing for a single session.
 *
 * Usage:
 *   const scheduler = new MessageScheduler()
 *   const result = scheduler.enqueue(message, isStreaming)
 *   if (result.dispatched) { /* send immediately *\/ }
 *   // On 'done' event:
 *   const pending = scheduler.flushPending()
 *   // send pending[0] if it exists
 */
export class MessageScheduler {
  private queue: ScheduledMessage[] = []
  private idCounter = 0

  /**
   * Enqueue a message. If the session is idle (not streaming), returns
   * dispatched=true so the caller sends it immediately. If streaming,
   * the message is queued for later dispatch.
   */
  enqueue(
    message: string,
    isStreaming: boolean,
    images?: Array<{ data: string; mimeType: string }>,
  ): DispatchResult {
    if (!isStreaming) {
      // Session is idle — dispatch immediately
      return {
        dispatched: true,
        scheduled: false,
        strategy: 'immediate',
        queueLength: this.queue.length,
      }
    }

    // Session is running — queue for after current turn
    if (this.queue.length >= MAX_PENDING_PER_SESSION) {
      // Drop oldest to keep memory bounded
      this.queue.shift()
    }

    this.idCounter++
    this.queue.push({
      id: `sched-${this.idCounter}`,
      text: message,
      queuedAt: new Date().toISOString(),
      strategy: 'queue_after_turn',
      images,
    })

    return {
      dispatched: false,
      scheduled: true,
      strategy: 'queue_after_turn',
      queueLength: this.queue.length,
      reason: 'session_running',
    }
  }

  /**
   * Flush pending messages. Called when the session becomes idle (on 'done').
   * Returns the next message to send, or null if queue is empty.
   */
  flushPending(): ScheduledMessage | null {
    if (this.queue.length === 0) return null
    return this.queue.shift() || null
  }

  /**
   * Check if there are pending messages.
   */
  hasPending(): boolean {
    return this.queue.length > 0
  }

  /**
   * Get the number of pending messages.
   */
  pendingCount(): number {
    return this.queue.length
  }

  /**
   * Get a snapshot of all pending messages (for inspection/display).
   */
  getPending(): Array<{ id: string; text: string; queuedAt: string }> {
    return this.queue.map(m => ({ id: m.id, text: m.text, queuedAt: m.queuedAt }))
  }

  /**
   * Discard all pending messages.
   */
  clear(): number {
    const count = this.queue.length
    this.queue = []
    return count
  }
}
