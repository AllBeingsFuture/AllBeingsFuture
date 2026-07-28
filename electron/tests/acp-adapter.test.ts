import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { BridgeManager } from '../bridge/bridge.js'
import type { BridgeEvent } from '../bridge/types.js'

const fakeAgentPath = fileURLToPath(new URL('./fixtures/fake-acp-agent.js', import.meta.url))

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 4_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${message}`)
}

function adapterConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    executablePath: process.execPath,
    defaultArgs: fakeAgentPath,
    workDir: process.cwd(),
    startupTimeoutMs: 2_000,
    shutdownTimeoutMs: 250,
    ...overrides,
  }
}

test('ACP bridge negotiates v1 and normalizes streaming updates', async () => {
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []

  try {
    await manager.initSession('local-session', 'acp', adapterConfig({ autoAccept: true }), (event) => {
      events.push(event)
    })

    const ready = events.find((event) => event.event === 'status' && event.phase === 'ready')
    assert.equal(ready?.initializeResponse?.protocolVersion, 1)
    assert.equal(ready?.initializeResponse?.agentInfo?.name, 'Fake ACP Agent')
    assert.equal(ready?.conversationId, 'fake-acp-session')
    assert.equal(manager.isSessionActive('local-session'), true)

    await manager.sendMessage('local-session', 'hello')
    await waitFor(
      () => events.some((event) => event.event === 'done'),
      'the ACP prompt turn to complete',
    )

    assert.deepEqual(
      events.filter((event) => event.event === 'thinking').map((event) => event.text),
      ['checking'],
    )
    assert.equal(
      events.filter((event) => event.event === 'delta').map((event) => event.text).join(''),
      'echo:hello permission:allow',
    )

    const toolCreated = events.find((event) => event.event === 'tool' && event.isUpdate === false)
    assert.equal(toolCreated?.toolCallId, 'tool-1')
    assert.equal(toolCreated?.toolKind, 'read')
    assert.deepEqual(toolCreated?.input, { path: 'README.md' })
    const toolCompleted = events.find((event) => event.event === 'tool' && event.isUpdate === true)
    assert.equal(toolCompleted?.toolStatus, 'completed')
    assert.deepEqual(toolCompleted?.output, { bytes: 42 })

    const permissionEvents = events.filter((event) => event.event === 'permission')
    assert.equal(permissionEvents.length, 2)
    assert.equal(permissionEvents[0].options?.[0].kind, 'allow_once')
    assert.deepEqual(permissionEvents[1].outcome, { outcome: 'selected', optionId: 'allow' })

    assert.ok(events.some((event) =>
      event.event === 'plan' && event.entries?.[0].content === 'Verify adapter'))
    assert.ok(events.some((event) =>
      event.event === 'plan' && event.planId === 'plan-1' && event.entries?.[0].status === 'in_progress'))
    assert.ok(events.some((event) =>
      event.event === 'status' && event.phase === 'mode' && event.detail === 'code'))
    assert.ok(events.some((event) =>
      event.event === 'status' && event.phase === 'usage' && event.data?.used === 128))

    const done = events.find((event) => event.event === 'done')
    assert.equal(done?.stopReason, 'end_turn')
    assert.equal(done?.usage?.input_tokens, 7)
    assert.equal(done?.usage?.output_tokens, 5)
    assert.equal(done?.turnActive, false)
    assert.equal(manager.isSessionActive('local-session'), true)
  } finally {
    await manager.destroyAll()
  }
})

test('ACP permission requests are cancelled unless auto-accept is configured', async () => {
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []

  try {
    await manager.initSession('permission-session', 'acp-stdio', adapterConfig(), (event) => {
      events.push(event)
    })
    await manager.sendMessage('permission-session', 'restricted')
    await waitFor(
      () => events.some((event) => event.event === 'done'),
      'the permission test turn to complete',
    )

    const resolution = events.find((event) => event.event === 'permission' && event.outcome)
    assert.deepEqual(resolution?.outcome, { outcome: 'cancelled' })
    assert.equal(
      events.filter((event) => event.event === 'delta').map((event) => event.text).join(''),
      'echo:restricted permission:cancelled',
    )
  } finally {
    await manager.destroyAll()
  }
})

test('ACP forwards configured instructions once and negotiates image prompts', async () => {
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []

  try {
    await manager.initSession('instruction-session', 'acp', adapterConfig({
      autoAccept: true,
      customInstructions: 'custom instruction',
      appendSystemPrompt: 'runtime instruction',
    }), (event) => {
      events.push(event)
    })

    await manager.sendMessage('instruction-session', 'first', [{
      data: 'aW1hZ2U=',
      mimeType: 'image/png',
    }])
    await waitFor(
      () => events.some((event) => event.event === 'done'),
      'the first instructed prompt',
    )
    assert.ok(events.some((event) =>
      event.event === 'delta'
      && event.text === 'echo:custom instruction\n\nruntime instruction\n\nfirst'))

    await manager.sendMessage('instruction-session', 'second')
    await waitFor(
      () => events.filter((event) => event.event === 'done').length === 2,
      'the second prompt without duplicated instructions',
    )
    assert.ok(events.some((event) => event.event === 'delta' && event.text === 'echo:second'))
    assert.equal(events.filter((event) => event.event === 'delta' && event.text?.includes('runtime instruction')).length, 1)
  } finally {
    await manager.destroyAll()
  }
})

test('ACP cancellation is cooperative and keeps a healthy agent reusable', async () => {
  const manager = new BridgeManager()
  const events: BridgeEvent[] = []

  try {
    await manager.initSession('cancel-session', 'acp', adapterConfig(), (event) => {
      events.push(event)
    })
    await manager.sendMessage('cancel-session', 'cancel')
    await waitFor(
      () => events.some((event) => event.event === 'status' && event.phase === 'running'),
      'the cancellable turn to start',
    )
    await manager.stopSession('cancel-session')
    await waitFor(
      () => events.some((event) => event.event === 'done' && event.stopReason === 'cancelled'),
      'the cancelled stop response',
    )
    assert.equal(manager.isSessionActive('cancel-session'), true)

    await manager.sendMessage('cancel-session', 'after-cancel')
    await waitFor(
      () => events.filter((event) => event.event === 'done').length === 2,
      'a second turn on the same ACP process',
    )
    assert.ok(events.some((event) => event.event === 'delta' && event.text === 'echo:after-cancel'))
  } finally {
    await manager.destroyAll()
  }
})

test('ACP cancellation tears down an uncooperative subprocess', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'abf-acp-cancel-'))
  const marker = path.join(tempDir, 'agent-exited')
  const manager = new BridgeManager()

  try {
    await manager.initSession('stuck-session', 'acp', adapterConfig({
      shutdownTimeoutMs: 50,
      envOverrides: { FAKE_ACP_EXIT_MARKER: marker },
    }), () => {})
    await manager.sendMessage('stuck-session', 'ignore-cancel')
    await manager.stopSession('stuck-session')

    await waitFor(() => existsSync(marker), 'the stuck fake agent process to exit')
    assert.equal(manager.isSessionActive('stuck-session'), false)
  } finally {
    await manager.destroyAll()
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ACP adapter reports version, process, and timeout startup failures clearly', async (t) => {
  await t.test('protocol version mismatch', async () => {
    const manager = new BridgeManager()
    await assert.rejects(
      manager.initSession('wrong-version', 'acp', adapterConfig({
        envOverrides: { FAKE_ACP_BEHAVIOR: 'wrong_version' },
      }), () => {}),
      /ACP protocol version mismatch: client supports v1, agent selected v2/,
    )
    assert.equal(manager.hasSession('wrong-version'), false)
  })

  await t.test('agent process crash', async () => {
    const manager = new BridgeManager()
    await assert.rejects(
      manager.initSession('crash', 'acp', adapterConfig({
        envOverrides: { FAKE_ACP_BEHAVIOR: 'crash' },
      }), () => {}),
      /ACP startup failed.*connection closed.*code 7.*fake startup failure/s,
    )
    assert.equal(manager.hasSession('crash'), false)
  })

  await t.test('initialize timeout', async () => {
    const manager = new BridgeManager()
    await assert.rejects(
      manager.initSession('timeout', 'acp', adapterConfig({
        startupTimeoutMs: 75,
        envOverrides: { FAKE_ACP_BEHAVIOR: 'hang_initialize' },
      }), () => {}),
      /ACP initialize timed out after 75ms/,
    )
    assert.equal(manager.hasSession('timeout'), false)
  })
})
