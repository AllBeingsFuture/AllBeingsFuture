import { writeFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import {
  PROTOCOL_VERSION,
  agent,
  methods,
  ndJsonStream,
  type AgentContext,
  type SessionUpdate,
} from '@agentclientprotocol/sdk'

const remoteSessionId = 'fake-acp-session'
const turns = new Map<string, AbortController>()

function markExit(): void {
  const marker = process.env.FAKE_ACP_EXIT_MARKER
  if (marker) writeFileSync(marker, 'exited', 'utf8')
}

function terminate(): void {
  markExit()
  process.exit(0)
}

process.once('SIGTERM', terminate)
process.once('SIGINT', terminate)

async function sendUpdate(client: AgentContext, update: SessionUpdate): Promise<void> {
  await client.notify(methods.client.session.update, { sessionId: remoteSessionId, update })
}

async function run(): Promise<void> {
  const behavior = process.env.FAKE_ACP_BEHAVIOR || 'normal'
  if (behavior === 'crash') {
    process.stderr.write('fake startup failure\n')
    process.exit(7)
  }
  if (behavior === 'malformed') {
    process.stdout.write('this is not json\n')
    await new Promise(() => {})
  }

  const fakeAgent = agent({ name: 'allbeingsfuture-fake-acp-agent' })
    .onRequest(methods.agent.initialize, async () => {
      if (behavior === 'hang_initialize') await new Promise(() => {})
      return {
        protocolVersion: behavior === 'wrong_version' ? PROTOCOL_VERSION + 1 : PROTOCOL_VERSION,
        agentInfo: { name: 'Fake ACP Agent', version: '1.0.0' },
        agentCapabilities: {
          loadSession: true,
          // Real agents often omit image capability even when they accept multimodal prompts.
          promptCapabilities: behavior === 'no_image_capability' ? {} : { image: true },
          mcpCapabilities: { http: true, sse: true },
          sessionCapabilities: { close: {} },
        },
      }
    })
    .onRequest(methods.agent.session.new, async () => ({ sessionId: remoteSessionId }))
    .onRequest(methods.agent.session.load, async () => ({}))
    .onRequest(methods.agent.session.close, async () => ({}))
    .onNotification(methods.agent.session.cancel, async ({ params }) => {
      turns.get(params.sessionId)?.abort()
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client, signal }) => {
      const turn = new AbortController()
      turns.set(params.sessionId, turn)
      signal.addEventListener('abort', () => turn.abort(), { once: true })
      const text = params.prompt.find((content) => content.type === 'text')?.text || ''
      const imageCount = params.prompt.filter((content) => content.type === 'image').length

      if (text === 'cancel') {
        await new Promise<void>((resolve) => turn.signal.addEventListener('abort', () => resolve(), { once: true }))
        turns.delete(params.sessionId)
        return { stopReason: 'cancelled' }
      }

      if (text === 'ignore-cancel') {
        await new Promise(() => {})
      }

      await sendUpdate(client, {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'checking' },
        messageId: 'thought-1',
      })
      await sendUpdate(client, {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: imageCount > 0 ? `echo:${text} images:${imageCount}` : `echo:${text}`,
        },
        messageId: 'message-1',
      })
      await sendUpdate(client, {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Inspect workspace',
        kind: 'read',
        status: 'in_progress',
        rawInput: { path: 'README.md' },
      })

      const permission = await client.request(methods.client.session.requestPermission, {
        sessionId: remoteSessionId,
        toolCall: {
          toolCallId: 'tool-1',
          title: 'Inspect workspace',
          kind: 'read',
          rawInput: { path: 'README.md' },
        },
        options: [
          { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject once', kind: 'reject_once' },
        ],
      })
      await sendUpdate(client, {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: permission.outcome.outcome === 'selected'
            ? ` permission:${permission.outcome.optionId}`
            : ' permission:cancelled',
        },
        messageId: 'message-1',
      })
      await sendUpdate(client, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        status: 'completed',
        rawOutput: { bytes: 42 },
      })
      await sendUpdate(client, {
        sessionUpdate: 'plan',
        entries: [{ content: 'Verify adapter', priority: 'high', status: 'completed' }],
      })
      await sendUpdate(client, {
        sessionUpdate: 'plan_update',
        plan: {
          type: 'items',
          planId: 'plan-1',
          entries: [{ content: 'Ship runtime', priority: 'medium', status: 'in_progress' }],
        },
      })
      // Optional ACP updates the adapter accepts but does not surface:
      await sendUpdate(client, {
        sessionUpdate: 'current_mode_update',
        currentModeId: 'code',
      })
      await sendUpdate(client, {
        sessionUpdate: 'usage_update',
        used: 128,
        size: 4096,
      })

      turns.delete(params.sessionId)
      return {
        stopReason: 'end_turn',
        usage: {
          totalTokens: 12,
          inputTokens: 7,
          outputTokens: 5,
        },
      }
    })

  const stream = ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  )
  const connection = fakeAgent.connect(stream)
  await connection.closed
  terminate()
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
