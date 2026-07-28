# ACP Renderer Streaming Contract

## Scope and compatibility

This renderer slice targets the stable Agent Client Protocol (ACP) wire protocol version `1`.
It does not consume `experimental/v2`, draft `state_change` behavior, or provider-specific
event payloads. The backend must negotiate `protocolVersion: 1` for native ACP connections.

The renderer does not implement ACP transport and does not depend on
`@agentclientprotocol/sdk`. The eventual Electron/Node transport integration should pin a
stable SDK release in the root package lock. Native ACP and non-native CLI providers remain
separate backend layers:

- A native ACP v1 transport negotiates capabilities and converts stable ACP messages.
- A legacy CLI adapter parses its provider output and converts it independently.
- Both emit the normalized IPC events below. The renderer never branches on provider.

The normalized TypeScript source of truth is
`frontend/src/types/agentStreamTypes.ts`.

## Backend to renderer

Electron emits one object per `agent:stream` IPC notification:

```ts
type Envelope = {
  sessionId: string
  sequence: number
  timestamp?: string
  source?: { kind: 'native-acp-v1' | 'legacy-adapter'; provider?: string }
}
```

`sequence` is required, non-negative, and strictly increasing for the lifetime of a session.
The renderer ignores an event when its sequence is less than or equal to the last applied
sequence. Backends must serialize delivery per session. This rule makes retransmission safe
and prevents duplicate text.

The envelope is combined with one event:

```ts
{ type: 'text_delta'; itemId: string; delta: string }
{ type: 'thinking_update'; itemId: string; text: string; mode?: 'delta' | 'replace' }
{ type: 'tool_call'; toolCallId: string; title: string; name?: string; input?: object }
{
  type: 'tool_update'
  toolCallId: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  name?: string
  title?: string
  input?: object
  resultDelta?: string
  output?: { stream: 'stdout' | 'stderr'; text: string }
  error?: string
}
{
  type: 'plan'
  title?: string
  entries: Array<{
    id: string
    title: string
    status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  }>
}
{ type: 'status'; status: 'starting' | 'running' | 'waiting' | 'idle'; message?: string }
{
  type: 'permission_request'
  request: {
    requestId: string
    toolCallId?: string
    title: string
    description?: string
    options: Array<{
      optionId: string
      label: string
      kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
    }>
  }
}
{ type: 'done'; stopReason?: string }
{ type: 'error'; message: string }
{ type: 'cancelled'; reason?: string }
```

`text_delta`, `resultDelta`, and `output.text` are append-only deltas. The backend must not
send the accumulated text in these fields. `thinking_update` supports both append-only ACP
chunks and replace-style legacy adapter output. `itemId`, `toolCallId`, plan entry IDs, and
permission request IDs must remain stable within a session; an adapter must synthesize IDs
when its source protocol has none.

`done`, `error`, and `cancelled` are terminal for the current turn. The renderer flushes
partial text, thinking, and tool state, clears pending permission UI, and stops streaming.

## Stable ACP v1 mapping

The native integration should use these conversions from the stable v1 schema:

- `session/update` `agent_message_chunk` text content -> `text_delta`.
- `session/update` `agent_thought_chunk` text content -> `thinking_update` with `mode: 'delta'`.
- `session/update` `tool_call` -> `tool_call`. ACP `title` is preserved; a generic tool name
  may be omitted.
- `session/update` `tool_call_update` -> `tool_update`. ACP tool content is replacement data,
  so the backend must diff it against the previous call state before emitting renderer
  deltas. `rawInput`/`rawOutput` may be normalized when they are displayable.
- `session/update` `plan` -> `plan`. ACP sends the complete plan, so each event replaces the
  renderer plan. Position-based stable IDs may be synthesized for v1 entries.
- `session/request_permission` -> `permission_request`. Use the JSON-RPC request ID as
  `requestId`; map ACP option `name` to `label` without changing `optionId` or `kind`.
- `session/prompt` response `stopReason: 'cancelled'` -> `cancelled`; all other successful
  stop reasons -> `done`. Transport or adapter failures -> `error`.

`status` is a normalized application event derived from the v1 prompt/adapter lifecycle. It
must not be implemented by depending on the draft ACP v2 `state_change` update.

The public stable v1 schema is
https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json.

## Renderer to backend

A permission button invokes:

```ts
window.electronAPI.invoke('agent:permission:respond', {
  sessionId,
  requestId,
  optionId,
})
```

The backend resolves the matching native ACP `session/request_permission` request with
`{ outcome: 'selected', optionId }`. A legacy adapter routes the same choice through its own
permission mechanism. The invocation may return `undefined` or `{ accepted: true }`; return
`{ accepted: false, error }` or reject to leave the prompt visible and announce the error.

Cancellation continues through the existing `ProcessService.StopProcess` frontend command.
The native ACP backend should translate it to stable v1 `session/cancel` and respond to every
pending permission request with `{ outcome: 'cancelled' }`. A legacy adapter uses its existing
interrupt/termination mechanism. The renderer immediately enters `cancelling`, disables the
stop button, and settles on the backend result or a normalized terminal event.

## Legacy coexistence

Existing `chat:update`, `chat:patch`, and `agent:update` listeners remain supported. Before a
normalized turn starts they behave exactly as before. While a normalized stream is active for
a session, chat snapshots and patches for that session are ignored so parallel compatibility
delivery cannot overwrite or duplicate the normalized turn. After a terminal event, a final
legacy snapshot may reconcile persisted history.

Live normalized messages are buffered per session. Background updates change that session's
runtime status without replacing the selected conversation, and switching sessions can
recover the buffered stream. Existing child-session metadata and grouping are unchanged.

## Clean-room boundary

This design was implemented independently from the ACP public v1 specification and the
existing AllBeingsFuture frontend architecture. Public product descriptions for AionUi were
consulted only for high-level interaction expectations such as visible pending approvals and
provider-neutral sessions. No AionUi/iOfficeAI, AgentWrapper, or agent-orchestrator source,
component hierarchy, UI styling, copy, tests, assets, or proprietary naming was copied,
rewritten, or approximated. The UI uses AllBeingsFuture's existing layout, controls, colors,
icons, language, and message model.

No third-party package was added for this slice, so package locks and license inventories are
unchanged.
