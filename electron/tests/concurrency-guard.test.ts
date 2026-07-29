/**
 * ConcurrencyGuard: only maxSessions hard-blocks.
 * Memory pressure (freemem % or absolute free MB) is warning-only —
 * Node os.freemem() undercounts reclaimable memory on macOS.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { ConcurrencyGuard, type MemoryReader } from '../services/concurrency-guard.js'

const MB = 1024 * 1024

function memoryAt(totalMB: number, freeMB: number): MemoryReader {
  return () => ({
    totalBytes: totalMB * MB,
    freeBytes: freeMB * MB,
  })
}

test('allows session when freemem reports ~99% used (macOS false positive)', () => {
  // 16 GB machine, 195 MB free → ~99% "used" by os.freemem() — must not hard-block
  const guard = new ConcurrencyGuard(
    { memoryWarningPercent: 85 },
    memoryAt(16384, 195),
  )

  const result = guard.checkCanCreateSession()
  assert.equal(result.allowed, true)
  assert.equal(result.reason, undefined)
  assert.ok(result.warning, 'expected high-usage warning')
  assert.match(result.warning!, /195MB free|High memory usage/i)
})

test('allows session with only 50MB free (warn only, never hard-block on freemem)', () => {
  const guard = new ConcurrencyGuard(
    { memoryWarningPercent: 85 },
    memoryAt(16384, 50),
  )

  const result = guard.checkCanCreateSession()
  assert.equal(result.allowed, true)
  assert.equal(result.reason, undefined)
  assert.ok(result.warning, 'expected memory warning')
  assert.match(result.warning!, /50MB free/i)
})

test('allows session near 94–98% freemem usage with a few hundred MB free', () => {
  const cases = [
    { freeMB: 1024, label: '~1GB free (~94%)' },
    { freeMB: 512, label: '~512MB free (~97%)' },
    { freeMB: 300, label: '~300MB free (~98%)' },
    { freeMB: 195, label: '~195MB free (~99%)' },
  ] as const

  for (const { freeMB, label } of cases) {
    const guard = new ConcurrencyGuard({}, memoryAt(16384, freeMB))
    const result = guard.checkCanCreateSession()
    assert.equal(result.allowed, true, `should allow at ${label}`)
    assert.equal(result.reason, undefined, `no hard block reason at ${label}`)
  }
})

test('deprecated memoryBlockFreeMB is ignored and does not hard-block', () => {
  const guard = new ConcurrencyGuard(
    { memoryBlockFreeMB: 256 },
    memoryAt(16384, 100),
  )

  const result = guard.checkCanCreateSession()
  assert.equal(result.allowed, true)
  assert.equal(result.reason, undefined)
  assert.ok(result.warning)
})

test('maxSessions remains a hard block regardless of free memory', () => {
  const guard = new ConcurrencyGuard(
    { maxSessions: 2 },
    memoryAt(16384, 8000),
  )

  guard.registerSession('s1')
  guard.registerSession('s2')

  const result = guard.checkCanCreateSession()
  assert.equal(result.allowed, false)
  assert.match(result.reason!, /Maximum concurrent session limit/)
})

test('register/unregister tracking is idempotent and accurate', () => {
  const guard = new ConcurrencyGuard(
    { maxSessions: 3 },
    memoryAt(16384, 8000),
  )

  guard.registerSession('a')
  guard.registerSession('a') // idempotent
  assert.equal(guard.getActiveSessionCount(), 1)
  assert.equal(guard.isSessionRegistered('a'), true)

  guard.registerSession('b')
  assert.equal(guard.getActiveSessionCount(), 2)

  guard.unregisterSession('a')
  guard.unregisterSession('a') // idempotent
  assert.equal(guard.getActiveSessionCount(), 1)
  assert.equal(guard.isSessionRegistered('a'), false)

  assert.equal(guard.checkCanCreateSession().allowed, true)
})

test('getResourceStatus reflects canCreate and warning for high freemem %', () => {
  const guard = new ConcurrencyGuard(
    { memoryWarningPercent: 85, maxSessions: 9 },
    memoryAt(16384, 400),
  )

  const status = guard.getResourceStatus()
  assert.equal(status.canCreate, true)
  assert.equal(status.currentSessions, 0)
  assert.equal(status.maxSessions, 9)
  assert.equal(status.availableMemoryMB, 400)
  assert.equal(status.totalMemoryMB, 16384)
  assert.ok(status.memoryUsagePercent >= 97)
  assert.ok(status.warning)
  assert.equal(status.reason, undefined)
})

test('getResourceStatus allows create with warning when free MB is very low', () => {
  const guard = new ConcurrencyGuard(
    {},
    memoryAt(8192, 50),
  )

  const status = guard.getResourceStatus()
  assert.equal(status.canCreate, true)
  assert.equal(status.reason, undefined)
  assert.ok(status.warning)
  assert.match(status.warning!, /50MB free/i)
})
