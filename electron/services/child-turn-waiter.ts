/**
 * Pure helpers for child-turn waiters (AndWait).
 * Extracted so supersede / resolve can be unit-tested without Electron.
 */

export interface ChildTurnWaiterHandle {
  resolve: (result: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Install a new turn waiter. If one already exists for the child, clear its
 * timer and reject the old Promise so it cannot later delete the new entry.
 */
export function installChildTurnWaiter(
  map: Map<string, ChildTurnWaiterHandle>,
  childSessionId: string,
  entry: ChildTurnWaiterHandle,
): void {
  const old = map.get(childSessionId)
  if (old) {
    clearTimeout(old.timer)
    map.delete(childSessionId)
    old.reject(new Error('superseded by new turn waiter'))
  }
  map.set(childSessionId, entry)
}

/** Resolve a pending turn waiter (clears timeout + map entry). */
export function resolveChildTurnWaiterEntry(
  map: Map<string, ChildTurnWaiterHandle>,
  childSessionId: string,
  result: string,
): boolean {
  const waiter = map.get(childSessionId)
  if (!waiter) return false
  clearTimeout(waiter.timer)
  map.delete(childSessionId)
  waiter.resolve(result)
  return true
}

/** Reject a pending turn waiter (clears timeout + map entry). */
export function rejectChildTurnWaiterEntry(
  map: Map<string, ChildTurnWaiterHandle>,
  childSessionId: string,
  error: Error,
): boolean {
  const waiter = map.get(childSessionId)
  if (!waiter) return false
  clearTimeout(waiter.timer)
  map.delete(childSessionId)
  waiter.reject(error)
  return true
}

/** Snapshot used by waitAgentIdle to decide immediate return. */
export interface AgentIdleSnapshot {
  /** Tracked agent status from AgentTracker, if known */
  status?: string | null
  /** sessionStates.get(child)?.streaming */
  streaming?: boolean | null
  /** agentIdleFlags for this child (sticky until child runs again) */
  idleFlag: boolean
}

/**
 * True when waitAgentIdle should return immediately (child is idle / terminal).
 * Does not mutate flags — idle flag must remain set until the child becomes running again.
 */
export function shouldResolveAgentIdleWait(s: AgentIdleSnapshot): boolean {
  if (s.idleFlag) return true
  const status = s.status
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return true
  // Persistent children stay alive with status=idle after each turn
  if (status === 'idle' && !s.streaming) return true
  return false
}
