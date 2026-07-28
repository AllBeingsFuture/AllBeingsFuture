import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentStreamNormalizer } from '../services/agent-stream-normalizer.js'
import type { BridgeEvent } from '../bridge/types.js'

test('normalizer maps ACP-style bridge events with increasing sequences', () => {
  const normalizer = new AgentStreamNormalizer()
  normalizer.configureSession('s1', { kind: 'native-acp-v1', provider: 'acp-agent' })

  const text = normalizer.normalize('s1', { event: 'delta', text: 'hi', itemId: 'm1' })
  assert.equal(text?.type, 'text_delta')
  assert.equal(text?.sequence, 0)
  if (text?.type === 'text_delta') {
    assert.equal(text.delta, 'hi')
    assert.equal(text.itemId, 'm1')
    assert.equal(text.source?.kind, 'native-acp-v1')
  }

  const thinking = normalizer.normalize('s1', { event: 'thinking', text: 'hmm', itemId: 't1' })
  assert.equal(thinking?.type, 'thinking_update')
  assert.equal(thinking?.sequence, 1)
  if (thinking?.type === 'thinking_update') {
    assert.equal(thinking.mode, 'delta')
  }

  const tool = normalizer.normalize('s1', {
    event: 'tool',
    toolCallId: 'tool-1',
    name: 'Read file',
    input: { path: 'a.ts' },
    isUpdate: false,
    toolStatus: 'pending',
  })
  assert.equal(tool?.type, 'tool_call')
  assert.equal(tool?.sequence, 2)

  const toolUpdate = normalizer.normalize('s1', {
    event: 'tool',
    toolCallId: 'tool-1',
    name: 'Read file',
    isUpdate: true,
    toolStatus: 'completed',
    output: { bytes: 3 },
  } as BridgeEvent)
  assert.equal(toolUpdate?.type, 'tool_update')
  assert.equal(toolUpdate?.sequence, 3)
  if (toolUpdate?.type === 'tool_update') {
    assert.equal(toolUpdate.status, 'completed')
    assert.ok(toolUpdate.resultDelta?.includes('bytes'))
  }

  const plan = normalizer.normalize('s1', {
    event: 'plan',
    entries: [{ content: 'Step A', priority: 'high', status: 'completed' }] as BridgeEvent['entries'],
  })
  assert.equal(plan?.type, 'plan')
  if (plan?.type === 'plan') {
    assert.equal(plan.entries[0].title, 'Step A')
    assert.equal(plan.entries[0].id, 'plan-entry-0')
    assert.equal(plan.entries[0].status, 'completed')
  }

  const permission = normalizer.normalize('s1', {
    event: 'permission',
    requestId: '42',
    name: 'Inspect workspace',
    toolCallId: 'tool-1',
    options: [
      { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject once', kind: 'reject_once' },
    ] as BridgeEvent['options'],
  })
  assert.equal(permission?.type, 'permission_request')
  if (permission?.type === 'permission_request') {
    assert.equal(permission.request.requestId, '42')
    assert.equal(permission.request.options[0].label, 'Allow once')
  }

  // Permission outcomes are not streamed to the renderer.
  assert.equal(normalizer.normalize('s1', {
    event: 'permission',
    requestId: '42',
    outcome: { outcome: 'selected', optionId: 'allow' },
  }), null)

  const done = normalizer.normalize('s1', { event: 'done', stopReason: 'end_turn' })
  assert.equal(done?.type, 'done')
  assert.equal(done?.sequence, 6)

  const cancelled = normalizer.normalize('s1', { event: 'done', stopReason: 'cancelled' })
  assert.equal(cancelled?.type, 'cancelled')
  assert.equal(cancelled?.sequence, 7)
})

test('normalizer ignores ready status and maps running/idle', () => {
  const normalizer = new AgentStreamNormalizer()
  normalizer.configureSession('s2', { kind: 'legacy-adapter', provider: 'claude' })
  assert.equal(normalizer.normalize('s2', { event: 'status', phase: 'ready' }), null)

  const running = normalizer.normalize('s2', { event: 'status', phase: 'running' })
  assert.equal(running?.type, 'status')
  if (running?.type === 'status') assert.equal(running.status, 'running')

  const thinking = normalizer.normalize('s2', { event: 'thinking', text: 'legacy' })
  if (thinking?.type === 'thinking_update') assert.equal(thinking.mode, 'delta')
})
