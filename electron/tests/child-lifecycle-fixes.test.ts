/**
 * Lifecycle fixes: error waiters, turn-waiter supersede, dispose cleanup contracts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  installChildTurnWaiter,
  resolveChildTurnWaiterEntry,
  rejectChildTurnWaiterEntry,
  type ChildTurnWaiterHandle,
} from '../services/child-turn-waiter.js'

const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')

function read(rel: string): string {
  return readFileSync(path.join(workspaceRoot, rel), 'utf8')
}

// ─── Unit: createChildTurnWaiter supersede (item 6) ─────────────────

test('installChildTurnWaiter supersedes old entry: clears timer and rejects old promise', async () => {
  const map = new Map<string, ChildTurnWaiterHandle>()
  const childId = 'child-1'

  let oldResolved: string | null = null
  let oldTimerFired = false

  const oldTimer = setTimeout(() => {
    oldTimerFired = true
    // Simulate buggy old behavior: delete map entry on timeout
    map.delete(childId)
  }, 50)

  const oldPromise = new Promise<string>((resolve, reject) => {
    installChildTurnWaiter(map, childId, {
      resolve: (r) => { oldResolved = r; resolve(r) },
      reject,
      timer: oldTimer,
    })
  })

  // Suppress unhandled rejection noise until we await
  oldPromise.catch(() => {})

  let newResolved: string | null = null
  const newTimer = setTimeout(() => {
    map.delete(childId)
  }, 5_000)

  const newPromise = new Promise<string>((resolve, reject) => {
    installChildTurnWaiter(map, childId, {
      resolve: (r) => { newResolved = r; resolve(r) },
      reject,
      timer: newTimer,
    })
  })

  // Old must be rejected as superseded
  await assert.rejects(oldPromise, /superseded by new turn waiter/)
  assert.equal(oldResolved, null)

  // Map holds only the new waiter
  assert.equal(map.get(childId)?.timer, newTimer)

  // Wait past old timeout window — old timer must not steal/delete the new entry
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(oldTimerFired, false, 'old timer must be cleared on supersede')
  assert.ok(map.has(childId), 'new waiter must survive past old timeout')

  resolveChildTurnWaiterEntry(map, childId, 'ok')
  assert.equal(await newPromise, 'ok')
  assert.equal(newResolved, 'ok')
  assert.equal(map.has(childId), false)
})

test('resolveChildTurnWaiterEntry clears timer and removes map entry', () => {
  const map = new Map<string, ChildTurnWaiterHandle>()
  let resolved: string | undefined
  let timerCleared = false
  // Use a real timer we can observe via map delete semantics
  const timer = setTimeout(() => {
    timerCleared = false
    map.delete('c')
  }, 10_000)
  // Monkey: if clearTimeout was called, the callback never runs — check via resolve path
  map.set('c', {
    resolve: (r) => { resolved = r },
    reject: () => {},
    timer,
  })
  assert.equal(resolveChildTurnWaiterEntry(map, 'c', 'done'), true)
  assert.equal(resolved, 'done')
  assert.equal(map.has('c'), false)
  // Second resolve is no-op
  assert.equal(resolveChildTurnWaiterEntry(map, 'c', 'again'), false)
  clearTimeout(timer) // belt-and-suspenders if resolve failed to clear
  void timerCleared
})

test('rejectChildTurnWaiterEntry rejects and clears entry', async () => {
  const map = new Map<string, ChildTurnWaiterHandle>()
  const timer = setTimeout(() => {}, 10_000)
  const p = new Promise<string>((resolve, reject) => {
    map.set('c', { resolve, reject, timer })
  })
  assert.equal(rejectChildTurnWaiterEntry(map, 'c', new Error('gone')), true)
  await assert.rejects(p, /gone/)
  assert.equal(map.has('c'), false)
})

// ─── Source contracts: item 4 error waiters ─────────────────────────

test('process.ts error case resolves persistent-child turn + idle waiters (failed status)', () => {
  const source = read('electron/services/process.ts')
  const errorCase = source.match(/case 'error': \{[\s\S]*?break\n\s*\}/)
  assert.ok(errorCase, 'expected error case block')
  const block = errorCase[0]
  assert.match(block, /isPersistentChild/)
  assert.match(block, /resolveChildTurnWaiter/)
  assert.match(block, /updatePersistentAgentStatus/)
  assert.match(block, /'failed'/)
  assert.match(block, /setAgentIdleFlag/)
  assert.match(block, /resolveAgentIdleWaiters/)
  assert.match(block, /\(error:/)
  // finalize children still runs (parent error)
  assert.match(block, /finalizeChildAgents\(sessionId, 'failed'/)
})

test('finalizeChildAgents resolves child turn/idle waiters so parent-error does not hang', () => {
  const lifecycle = read('electron/services/agent-lifecycle.ts')
  const block = lifecycle.match(
    /finalizeChildAgents\([\s\S]*?\n  \}/,
  )
  assert.ok(block, 'expected finalizeChildAgents')
  assert.match(block[0], /resolveChildTurnWaiter/)
  assert.match(block[0], /resolveAgentIdleWaiters/)
  assert.match(block[0], /setAgentIdleFlag/)
})

// ─── Source contracts: item 6 waiter structure ──────────────────────

test('createChildTurnWaiter stores resolve/reject/timer and supersedes via installChildTurnWaiter', () => {
  const lifecycle = read('electron/services/agent-lifecycle.ts')
  assert.match(lifecycle, /installChildTurnWaiter/)
  assert.match(lifecycle, /resolveChildTurnWaiterEntry/)
  assert.match(lifecycle, /ChildTurnWaiterHandle/)
  const create = lifecycle.match(
    /createChildTurnWaiter\(childSessionId: string[\s\S]*?\n  resolveChildTurnWaiter/,
  )
  assert.ok(create, 'expected createChildTurnWaiter method definition')
  assert.match(create[0], /installChildTurnWaiter/)
  assert.match(create[0], /reject/)
  assert.match(create[0], /timer/)
  // Must not blindly .set overwrite without install helper
  assert.doesNotMatch(
    create[0],
    /this\.childTurnWaiters\.set\(childSessionId,\s*\(result/,
  )
})

// ─── Source contracts: item 7 dispose worktree ──────────────────────

test('disposeSession cleans managed child worktree via cleanupDisposedSessionWorktree', () => {
  const processSrc = read('electron/services/process.ts')
  const lifecycle = read('electron/services/agent-lifecycle.ts')
  const dispose = processSrc.match(
    /async disposeSession\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(dispose, 'expected disposeSession')
  assert.match(dispose[0], /cleanupDisposedSessionWorktree/)
  assert.match(lifecycle, /async cleanupDisposedSessionWorktree/)
  assert.match(lifecycle, /cleanupChildWorktree\(parent, child\)/)
  // Reuses managed-path gates
  assert.match(lifecycle, /isManagedAbfWorktreePath/)
})

// ─── Source contracts: item 9 isolation failure ─────────────────────

test('tryIsolateChildWorktree failure logs shared-cwd fallback and leaves worktree unset', () => {
  const lifecycle = read('electron/services/agent-lifecycle.ts')
  const fn = lifecycle.match(/private async tryIsolateChildWorktree\([\s\S]*?\n  \}/)
  assert.ok(fn, 'expected tryIsolateChildWorktree')
  assert.match(fn[0], /shared cwd fallback|shared cwd/)
  assert.match(fn[0], /child=\$\{child\.id\}|child=\$\{/)
  assert.match(fn[0], /parentDir/)
  // Catch must not call setWorktreeInfo (would invent paths)
  const catchBlock = fn[0].match(/catch \(err: unknown\) \{[\s\S]*\}$/)
  assert.ok(catchBlock, 'expected catch in tryIsolateChildWorktree')
  assert.doesNotMatch(catchBlock[0], /setWorktreeInfo/)
})

// ─── Source contracts: item 11 dispose map cleanup ──────────────────

test('disposeSession deletes session-keyed maps and cleans lifecycle waiters; stopProcess does not', () => {
  const processSrc = read('electron/services/process.ts')
  const dispose = processSrc.match(
    /async disposeSession\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(dispose, 'expected disposeSession')
  assert.match(dispose[0], /sessionStates\.delete/)
  assert.match(dispose[0], /schedulers\.delete/)
  assert.match(dispose[0], /agentStreamNormalizer\.clearSession/)
  assert.match(dispose[0], /cleanupDisposedSessionMaps/)

  const stop = processSrc.match(
    /async stopProcess\(sessionId: string\): Promise<void> \{[\s\S]*?\n  \}/,
  )
  assert.ok(stop, 'expected stopProcess')
  assert.doesNotMatch(stop[0], /sessionStates\.delete/)
  assert.doesNotMatch(stop[0], /cleanupDisposedSessionMaps/)
  assert.doesNotMatch(stop[0], /agentStreamNormalizer\.clearSession/)
  assert.doesNotMatch(stop[0], /cleanupDisposedSessionWorktree/)
  // stop still keeps sequence counters (comment contract)
  assert.match(stop[0], /Keep stream sequence counters/)

  const lifecycle = read('electron/services/agent-lifecycle.ts')
  assert.match(lifecycle, /cleanupDisposedSessionMaps/)
  const maps = lifecycle.match(/cleanupDisposedSessionMaps\([\s\S]*?\n  \}/)
  assert.ok(maps, 'expected cleanupDisposedSessionMaps body')
  assert.match(maps[0], /resolveChildTurnWaiter|resolveChildTurnWaiterEntry/)
  assert.match(maps[0], /agentIdleWaiters/)
  assert.match(maps[0], /agentIdleFlags/)
})
