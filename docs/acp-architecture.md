# AllBeingsFuture ACP Architecture

**Status:** architecture deliverable (docs only)\
**Protocol target:** official stable **Agent Client Protocol (ACP) v1** (`protocolVersion: 1`)\
**Stack:** TypeScript only — Electron main/Node + React renderer\
**Scope of this document:** integration architecture, cross-process contracts, rollout, and explicit runtime/UI mismatches for the integration worker

**Implementation references inspected (read-only, not cherry-picked):**

| Branch | Pinned SHA | Slice |
| --- | --- | --- |
| `origin/ao/allbeingsfuture-7/acp-runtime` | `19f91b8` | Electron main ACP adapter / process hooks |
| `origin/ao/allbeingsfuture-8/acp-streaming` | `91263ef` | Renderer normalized stream types / UX |

**Public specification sources (clean-room):**

- Stable protocol version statement and schema artifacts: [agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol) (`schema/v1/schema.json`)
- Official TypeScript SDK: [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk) (stable entry only; **do not** use `@agentclientprotocol/sdk/experimental/v2` for product paths)
- Protocol method surface used below is limited to stable v1 JSON-RPC methods defined in the public schema (for example `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/close`, `session/update`, `session/request_permission`)

**Clean-room constraint:** this document is derived only from the public ACP v1 materials above and this repository (including the two pinned branches). It does not inspect or copy AionUi / iOfficeAI, AgentWrapper, agent-orchestrator, or any external proprietary UI, text, assets, tests, or internal names.

---

## 1. Goals and non-goals

### 1.1 Goals

1. Connect AllBeingsFuture sessions to **native ACP agents** over stdio NDJSON JSON-RPC using stable ACP v1.
2. Keep existing **legacy provider adapters** (Claude Code, Codex, Gemini, OpenCode, OpenAI, …) working without requiring them to speak ACP.
3. Present a **single provider-neutral streaming UX** in the React renderer for both native ACP and legacy adapters.
4. Preserve existing IPC commands (`ProcessService.*`, `chat:update`, `chat:patch`, `agent:update`) for backward-compatible rollout.
5. Define process cleanup, permission mediation, security boundaries, and a test matrix the integration worker can implement against.

### 1.2 Non-goals

- Adopting experimental ACP v2 (`state_change`, draft wire formats, experimental SDK entry).
- Replacing SQLite session persistence or the supervisor/child-agent model in this pass.
- Shipping remote HTTP/WebSocket ACP transports in the first integration (local stdio only; remote is a future profile).
- Forcing every built-in CLI to become a native ACP server immediately.

---

## 2. Component boundaries

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Renderer (React / Vite / Zustand)                                        │
│  ConversationView · AgentActivityPanel · MessageInput                    │
│  agentStreamCore (pure reducers) · agentStreamIpc (parse/respond)        │
│  sessionSnapshotStore (per-session stream buffer + legacy coexistence)   │
│                                                                          │
│  Consumes ONLY AgentStreamEvent (normalized). Never imports ACP SDK.     │
└───────────────────────────────▲──────────────────────────────────────────┘
                                │ Electron IPC
                                │  push:  agent:stream
                                │  invoke: agent:permission:respond
                                │  invoke: ProcessService.StopProcess / Send*
                                │  legacy: chat:update | chat:patch | agent:update
┌───────────────────────────────┴──────────────────────────────────────────┐
│ Main process (Electron Node)                                             │
│                                                                          │
│  ipc/handlers  →  ProcessService  →  BridgeManager                       │
│                         │                  │                             │
│                         │                  ├─ AcpAdapter (native ACP)    │
│                         │                  ├─ ClaudeAdapter              │
│                         │                  ├─ CodexAdapter               │
│                         │                  ├─ GeminiAdapter              │
│                         │                  ├─ OpenCodeAdapter            │
│                         │                  └─ OpenAIAdapter / future     │
│                         │                                                │
│              StreamNormalizer (NEW integration seam)                     │
│              BridgeEvent  ──normalize──▶  AgentStreamEvent + sequence    │
│              PermissionBroker (sessionId, requestId ↔ pending RPC)       │
└───────────────────────────────▲──────────────────────────────────────────┘
                                │ stdio NDJSON JSON-RPC (native only)
┌───────────────────────────────┴──────────────────────────────────────────┐
│ Child process: ACP agent binary (or test fake agent)                     │
│  Official methods: initialize / session/* / session/update / permission  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Layer responsibilities

| Layer | Owns | Must not own |
| --- | --- | --- |
| **Renderer** | Stream reduction, plan/permission UI, cancel UX, message buffering | ACP SDK, agent process spawn, JSON-RPC, raw provider parsing |
| **ProcessService** | Session lifecycle, persistence, legacy chat patches, concurrency, child agents | Provider-specific wire formats |
| **BridgeManager** | Adapter selection, per-session adapter map, `init`/`send`/`stop`/`destroy` | UI types, IPC channel names |
| **AcpAdapter** | Spawn + NDJSON ACP client, negotiate v1, map ACP → internal `BridgeEvent` | Renderer event shape, sequence allocation for IPC |
| **Legacy adapters** | Provider CLI/SDK → internal `BridgeEvent` | ACP protocol types |
| **StreamNormalizer (integration)** | `BridgeEvent` → sequenced `AgentStreamEvent`, replay buffer, permission request IDs | Re-implementing ACP transport |
| **PermissionBroker (integration)** | Correlate UI `requestId` with pending `session/request_permission` | Auto-accept policy defaults without user config |

### 2.2 Type ownership

| Type family | Canonical location (target) | Notes |
| --- | --- | --- |
| ACP wire types | `@agentclientprotocol/sdk` (main process only) | Pin exact version in root lockfile |
| Internal adapter events | `electron/bridge/types.ts` → `BridgeEvent` | Shared by all adapters |
| Cross-process stream events | `frontend/src/types/agentStreamTypes.ts` → `AgentStreamEvent` | Source of truth for renderer + main emitter |
| Chat persistence messages | `electron/services/process-types.ts` → `ChatMessage` | Legacy snapshots remain authoritative after terminal turns |

---

## 3. Official stable ACP v1 lifecycle

Transport: **JSON-RPC 2.0 over NDJSON stdio** (local agent as child process).\
Wire compatibility is the integer negotiated in `initialize.protocolVersion`. Stable product value: **`1`**.

### 3.1 Client and agent initialization

```text
Client (ABF AcpAdapter)                         Agent (child process)
        |                                              |
        |---- initialize { protocolVersion: 1,         |
        |      clientCapabilities, clientInfo } ------>|
        |<--- InitializeResponse { protocolVersion,    |
        |      agentCapabilities, authMethods?,        |
        |      agentInfo? } ---------------------------|
        |                                              |
        |  FAIL if protocolVersion !== 1               |
        |  FAIL if required MCP/loadSession missing    |
```

**Client initialization rules for ABF:**

1. Import only the **stable** SDK entry (`@agentclientprotocol/sdk`), never `experimental/v2`.
2. Use `PROTOCOL_VERSION` from the SDK (value `1` in `@agentclientprotocol/sdk@1.3.0`).
3. Advertise conservative `clientCapabilities` that match what main actually implements. For the first integration pass:

```ts
clientCapabilities: {
  // Advertise only capabilities ABF truly implements.
  // Do not invent fields outside the public ClientCapabilities schema.
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
}
```

4. After initialize, assert:
   - `response.protocolVersion === 1`
   - If profile requires MCP HTTP/SSE servers, `agentCapabilities.mcpCapabilities` covers them
   - If resume/`session/load` is requested, `agentCapabilities.loadSession === true`
5. Store `agentCapabilities` and `agentInfo` for UI status and feature gating.

**SDK wiring pattern (main only):**

```ts
const app = client({ name: 'allbeingsfuture' })
  .onRequest(methods.client.session.requestPermission, handler)
  .onNotification(methods.client.session.update, handler)

const stream = ndJsonStream(writableStdin, readableStdout)
const connection = app.connect(stream)
await connection.agent.request(methods.agent.initialize, { ... })
```

### 3.2 Session new / load

```text
if resumeSessionId configured AND loadSession capability:
    session/load { sessionId, cwd, mcpServers, additionalDirectories? }
else:
    session/new  { cwd, mcpServers, additionalDirectories? }
        → { sessionId, modes?, configOptions? }
```

Rules:

- `cwd` is always an absolute workspace path (session worktree or project root).
- MCP server configs are normalized to ACP `McpServer` shapes (stdio / http / sse) before `session/new|load`.
- Persist the remote `sessionId` as the conversation id used for resume (`ProcessService` already stores `conversationId` on `done`).
- Prefer `session/load` when the agent advertises `loadSession`. Optional later: `session/resume` when `sessionCapabilities.resume` is present and product policy prefers it over load.

### 3.3 Prompt turn

```text
status: starting → running
session/prompt { sessionId, prompt: ContentBlock[] }
  ← concurrent session/update notifications
  ← optional session/request_permission requests
  → PromptResponse { stopReason }
terminal mapping:
  stopReason === 'cancelled'  → AgentStreamEvent cancelled
  other stopReason            → AgentStreamEvent done { stopReason }
  transport/adapter failure   → AgentStreamEvent error
```

**Prompt content construction:**

- User text → `{ type: 'text', text }`
- Images → `{ type: 'image', data, mimeType }` always forwarded when present (many agents accept multimodal input even when ACP handshake omits `promptCapabilities.image`)
- First-turn system/skill injection may prepend text blocks once per process lifetime (existing `appendSystemPrompt` / `customInstructions` pattern)

**Concurrency:** one active `session/prompt` per adapter instance. A second send must fail fast until the previous turn settles.

### 3.4 Cancel

```text
UI Stop
  → ProcessService.StopProcess
  → adapter.stop()
     1) abort local AbortController
     2) agent notify session/cancel { sessionId }
     3) pending session/request_permission → { outcome: 'cancelled' }
     4) wait short grace; if prompt hangs → shutdownProcess()
```

ACP requires that after client cancel, the agent’s prompt response uses `stopReason: "cancelled"` and outstanding permission requests are answered with cancelled outcomes.

### 3.5 Destroy / process cleanup

Ordered teardown for every ACP session:

1. Mark destroying; refuse new prompts.
2. `stop()` active turn (cancel + permission cancel).
3. If `sessionCapabilities.close` advertised → best-effort `session/close` with short timeout.
4. Close SDK connection.
5. End stdin; wait briefly for voluntary exit.
6. `SIGTERM` → wait `shutdownTimeoutMs` → `SIGKILL`.
7. Drop maps: remote session id, tool-call cache, pending permissions, sequence counters.
8. `BridgeManager.destroySession` / `destroyAll` on app quit.

---

## 4. Normalized cross-process streaming schema

This is the **integration contract** both commits must converge on. The renderer already defines it; main must emit it.

### 4.1 Envelope

Every `agent:stream` payload is an `AgentStreamEvent`:

```ts
type AgentStreamSource =
  | { kind: 'native-acp-v1'; provider?: string }
  | { kind: 'legacy-adapter'; provider?: string }

interface AgentStreamEventBase {
  sessionId: string          // ABF local session id (not remote ACP sessionId alone)
  sequence: number           // monotonic per local session, start at 0, strictly increasing
  timestamp?: string         // ISO-8601
  source?: AgentStreamSource
}
```

`sessionId` on the envelope is the **AllBeingsFuture session id**. The remote ACP session id is retained in main state and may appear in status/details or conversation persistence, not as a replacement for the envelope id.

### 4.2 Event union (aligned with streaming commit `91263ef`)

| `type` | Payload (beyond envelope) | Semantics |
| --- | --- | --- |
| `text_delta` | `itemId`, `delta` | Append-only assistant text |
| `thinking_update` | `itemId`, `text`, `mode?: 'delta' \| 'replace'` | ACP thoughts use `delta`; legacy may `replace` |
| `tool_call` | `toolCallId`, `title`, `name?`, `input?` | Tool creation |
| `tool_update` | `toolCallId`, `status`, optional fields, `resultDelta?`, `output?`, `error?` | Progress/result; deltas append-only |
| `plan` | `title?`, `entries: { id, title, status }[]` | Full replace of plan snapshot |
| `status` | `status: starting \| running \| waiting \| idle`, `message?` | App lifecycle, not ACP v2 `state_change` |
| `permission_request` | `request: { requestId, toolCallId?, title, description?, options[] }` | Blocks UI until respond/cancel |
| `done` | `stopReason?` | Terminal success (incl. non-cancel stop reasons) |
| `error` | `message` | Terminal failure |
| `cancelled` | `reason?` | Terminal cancel |

**Permission option shape (renderer):**

```ts
{ optionId: string; label: string; kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' }
```

**Plan entry status (renderer):** `pending | in_progress | completed | blocked`\
ACP v1 plan statuses are only `pending | in_progress | completed`. Native mapping never invents `blocked` unless a legacy adapter synthesizes it.

### 4.3 Stable ACP v1 → `AgentStreamEvent` mapping

| ACP v1 source | Normalized event | Mapping notes |
| --- | --- | --- |
| `session/update` `agent_message_chunk` | `text_delta` | Text from `content` when `type==='text'`; `itemId = messageId \|\| synthesized` |
| `session/update` `agent_thought_chunk` | `thinking_update` | `mode: 'delta'`; same `itemId` rules |
| `session/update` `tool_call` | `tool_call` | `title` required (fallback to `name`/`kind`/`'tool'`); `input` from `rawInput` |
| `session/update` `tool_call_update` | `tool_update` | Map `status`; **diff** ACP replacement `content`/`rawOutput` into `resultDelta` / structured `output` |
| `session/update` `plan` | `plan` | Map each entry: `title ← content`, synthesize stable `id` (e.g. `plan-entry-${index}` or hash of content), map status; drop ACP-only `priority` or keep internal-only |
| `session/update` `usage_update` | `status` (optional) or side-channel usage | Prefer attaching token/cost to turn completion metadata; do not require renderer support beyond optional status message |
| `session/update` `current_mode_update` / `config_option_update` / `session_info_update` / `available_commands_update` | `status` optional | Best-effort `message`; never fail the turn |
| `session/update` `user_message_chunk` | *(ignore)* | Client already knows user input |
| `session/request_permission` | `permission_request` | `requestId` = JSON-RPC request id stringified; `label ← option.name`; keep `optionId`/`kind` |
| `session/prompt` result | `done` or `cancelled` | `cancelled` only when `stopReason === 'cancelled'` |
| Child exit / JSON-RPC failure | `error` | Include concise stderr tail if available |

### 4.4 Internal `BridgeEvent` (runtime commit `19f91b8`)

Adapters today emit a flatter internal shape (selected fields):

```ts
event: 'delta' | 'done' | 'error' | 'tool' | 'thinking' | 'plan' | 'permission' | 'status' | 'agent_task'
// plus text, itemId, toolCallId, toolStatus, isUpdate, options, outcome, entries, stopReason, usage, ...
```

**Architecture rule:** `BridgeEvent` remains the **adapter-facing** internal event. The integration worker adds `StreamNormalizer` so the renderer never observes raw `BridgeEvent`.

### 4.5 Ordering and replay

1. Main allocates `sequence` per **local** `sessionId`, starting at `0`, incrementing by `1` for every emitted `AgentStreamEvent` (including status/permission/terminal).
2. Delivery is serialized per session (single queue; no parallel emit races).
3. Renderer ignores `sequence <= lastSequence` (duplicate/replay safe).
4. Optional main-side ring buffer (e.g. last N events per session) supports future “resync” without replaying partial text incorrectly.
5. Text/tool result fields are **append-only deltas**. Never re-send cumulative text in `delta` / `resultDelta`.
6. Plan events are **full snapshots** (replace), matching ACP plan notifications.
7. Terminal events (`done` / `error` / `cancelled`) finalize partial messages, clear permission UI, and end streaming for that turn. A later turn starts a new sequence continuation (do not reset to 0 while the renderer still holds the session stream state) **or** explicitly reset renderer `lastSequence` when starting a new normalized turn—pick one policy and test it. **Recommended:** keep monotonically increasing for the lifetime of the local session; do not reset.

### 4.6 Usage, thinking, tools, plans, status, errors

| Concern | Source of truth | Integration behavior |
| --- | --- | --- |
| Thinking | ACP `agent_thought_chunk` | Stream as `thinking_update` with `mode: 'delta'` |
| Tools | `tool_call` / `tool_call_update` | Create then update; statuses `pending\|in_progress\|completed\|failed` |
| Plans | ACP `plan` entries (`content`, `priority`, `status`) | Normalize to renderer entries; ignore unknown fields |
| Usage | ACP `usage_update` (and any future prompt metadata) | Persist on chat messages when possible; do not block UX if absent. Note: stable v1 `PromptResponse` schema requires only `stopReason`—do not rely on non-schema `usage` on the prompt result |
| Status | Application lifecycle | Emit `starting` on init/send, `running` during prompt, `waiting` on permission, `idle` after terminal |
| Errors | Spawn/init/prompt/process death | Single terminal `error` per failure; suppress duplicates |

---

## 5. Permissions

### 5.1 ACP permission request

Agent → client method: `session/request_permission` with:

- `sessionId` (remote)
- `toolCall`
- `options: { optionId, name, kind }[]`

Client must respond:

- `{ outcome: 'selected', optionId }` or
- `{ outcome: 'cancelled' }`

### 5.2 UI path

```text
PermissionBroker registers pending Promise keyed by requestId
  → emit permission_request on agent:stream
  → user clicks option in AgentActivityPanel
  → invoke agent:permission:respond { sessionId, requestId, optionId }
  → broker resolves ACP request
  → renderer resolveAgentStreamPermission clears local prompt
```

### 5.3 Policy matrix

| Config | Behavior |
| --- | --- |
| User responds via UI | `selected` with chosen `optionId` |
| User stops turn / session destroy | `cancelled` for all pending |
| `autoAccept: true` (session flag) | Prefer `allow_once`, else `allow_always`, else `cancelled` |
| No handler and `autoAccept: false` | **Must wait for UI** in integrated product; must not silently cancel as default once streaming UX is enabled |
| Unknown `optionId` from UI | Reject invoke with `{ accepted: false, error }`; leave prompt visible |

### 5.4 Security notes for permissions

- Never auto-select `allow_always` unless the user explicitly enabled a remembered-allow policy.
- Show tool title/input summary in the permission card before allow.
- Treat permission IPC as privileged: validate `sessionId` belongs to an active adapter and `requestId` is pending.

---

## 6. Provider profiles

Profiles describe how a configured ABF provider reaches an agent. Selection is driven by `providers.adapterType` (and optional command heuristics).

### 6.1 Profile table

| Profile id | `adapterType` aliases | Transport | Stream `source.kind` | Notes |
| --- | --- | --- | --- | --- |
| **Native ACP** | `acp`, `acp-stdio` | Child process stdio NDJSON ACP v1 | `native-acp-v1` | Requires executable path/command; optional `defaultArgs`, MCP list, resume id |
| **Claude Code (legacy)** | `claude-sdk`, `claude`, `claude-code`, … | In-process Claude Agent SDK | `legacy-adapter` | Existing adapter; normalizer maps BridgeEvents |
| **Codex (legacy)** | `codex-appserver`, `codex`, … | CLI/app-server JSON-RPC | `legacy-adapter` | Existing adapter |
| **Gemini (legacy)** | `gemini-headless`, `gemini-cli`, … | CLI subprocess | `legacy-adapter` | Existing adapter |
| **OpenCode (legacy)** | `opencode-sdk`, `opencode`, … | CLI/SDK | `legacy-adapter` | Existing adapter |
| **OpenAI API (legacy)** | `openai-api`, `openai` | HTTP API | `legacy-adapter` | Existing adapter |
| **Future native ACP agents** | `acp` + custom command | Same as Native ACP | `native-acp-v1` | Zed-compatible agents, Gemini ACP mode, community agents, etc. |
| **Future ACP-over-HTTP/WS** | (new profile, not in first pass) | Experimental SDK only if product accepts draft risk | `native-acp-v1` | Out of scope until stable remote transport is productized |

### 6.2 Native ACP profile configuration

```ts
interface NativeAcpProfileConfig {
  command?: string
  executablePath?: string
  defaultArgs?: string
  workDir?: string
  envOverrides?: Record<string, string>
  mcpServers?: unknown
  resumeSessionId?: string
  autoAccept?: boolean
  permissionMode?: string
  customInstructions?: string
  appendSystemPrompt?: string
  startupTimeoutMs?: number  // default 30_000
  shutdownTimeoutMs?: number // default 2_000
}
```

### 6.3 Adapter registration

`BridgeManager` remains the factory:

- Normalize aliases → create adapter
- Attach env overrides / resume flags
- Guarantee `destroy` on re-init and app quit

Native ACP participates in MCP injection the same way native-MCP providers do (`isAcpAdapter` path in process service): enabled MCP server configs are passed into adapter config and then into `session/new|load`.

### 6.4 When to prefer native ACP vs legacy adapter

| Situation | Choice |
| --- | --- |
| Agent publishes an ACP stdio server | Native ACP profile |
| Existing built-in Claude/Codex/Gemini/OpenCode paths already work | Keep legacy adapter; optional later dual-run behind flag |
| Need tool permission UX + plan streaming without parser heuristics | Native ACP or normalizer-enhanced legacy |
| Agent only speaks proprietary CLI logs | Legacy adapter |

---

## 7. Security

1. **Process isolation:** agents run as child processes with explicit `cwd`, filtered env (`buildChildProcessEnv`), and no shell unless resolution requires it.
2. **Capability honesty:** do not advertise `fs` / `terminal` client capabilities until ABF implements the corresponding ACP client methods safely (path allowlists, workspace sandbox).
3. **Path sandbox (future fs capability):** all agent-requested reads/writes must resolve within session workDir / additionalDirectories.
4. **Secrets:** API keys stay in main/env; never stream secrets through `agent:stream`.
5. **IPC hardening:** renderer uses preload `contextBridge`; only invoke known channels. Validate permission responses server-side.
6. **Auto-accept:** treat as power-user escape hatch, not default for untrusted agents.
7. **Stderr capture:** retain a bounded tail for diagnostics; do not render raw stderr as assistant text.
8. **Dependency surface:** only main process depends on `@agentclientprotocol/sdk`. Renderer stays SDK-free.
9. **Protocol downgrade:** reject agents that negotiate `protocolVersion !== 1`.
10. **Do not enable experimental v2** in production builds.

---

## 8. Backward-compatible rollout

### Phase 0 — docs/contracts (this deliverable)

- Architecture + mismatch list published.
- No user-visible behavior change on `main`.

### Phase 1 — integrate without breaking legacy

1. Land runtime ACP adapter behind `adapterType: acp | acp-stdio` only.
2. Land renderer stream types/UI, but keep listening to legacy channels.
3. Add `StreamNormalizer` + `agent:stream` emission **opt-in** when:
   - provider profile is native ACP, or
   - settings flag `acpNormalizedStreaming === true`.
4. While a normalized stream is **active** for a session, renderer ignores `chat:update` / `chat:patch` for that session (already implemented in streaming slice) to prevent double-append.
5. After terminal normalized event, allow a final legacy snapshot for persistence reconciliation.

### Phase 2 — permissions end-to-end

1. Register `agent:permission:respond` in `ipc/handlers`.
2. Wire `PermissionBroker` into `AcpAdapter` via `permissionHandler`.
3. Disable silent cancel default when UI streaming is enabled.

### Phase 3 — legacy adapters emit normalized events

- Claude/Codex/Gemini/OpenCode map into the same `AgentStreamEvent` union so the UI stops special-casing providers.

### Phase 4 — cleanup

- Remove dual-path only after telemetry shows normalized path stable.
- Keep BridgeEvent as internal adapter SPI.

**Feature flags (recommended):**

| Flag | Default | Effect |
| --- | --- | --- |
| `providers.adapterType = acp` | off unless user configures | Enables native transport |
| `settings.normalizedAgentStream` | `true` for ACP, `false` for legacy initially | Enables `agent:stream` |
| `session.autoAccept` | existing session value | Permission policy |

---

## 9. Integration sequence (worker checklist)

1. **Merge/order:** runtime adapter (`19f91b8` lineage) before or with normalizer; streaming UI (`91263ef` lineage) can land independently but is inert without `agent:stream`.
2. Implement `StreamNormalizer` in main (pure functions + per-session sequence state).
3. From `ProcessService.handleBridgeEvent` (or a parallel path), call normalizer and `webContents.send('agent:stream', event)`.
4. Add IPC handler `agent:permission:respond`.
5. Inject permission handler into `AcpAdapter` config during `initSession`.
6. Map cancel: `StopProcess` → `session/cancel` + permission cancel + normalized `cancelled`/`done` policy.
7. Ensure plan/permission/status bridge events are not dropped (today’s `handleBridgeEvent` switch lacks `plan` / `permission` / `status` cases).
8. Fix field renames listed in §10.
9. Expand tests: adapter fixture + normalizer unit tests + renderer reducer tests + one Electron IPC smoke test.
10. Pin `@agentclientprotocol/sdk` exact version in lockfile; record license in third-party notices if the product ships attributions.

---

## 10. Runtime / UI contract mismatches the integration worker **must** fix

These mismatches are observed by comparing `19f91b8` (runtime) with `91263ef` (streaming) and the official v1 schema. They are **blocking** for end-to-end ACP UX.

### 10.1 Transport / IPC gaps

| # | Mismatch | Runtime (`19f91b8`) | Streaming (`91263ef`) | Required fix |
| --- | --- | --- | --- | --- |
| M1 | Stream channel missing | Emits internal `BridgeEvent` into `ProcessService` only; uses `chat:update` / `chat:patch` | Listens for `agent:stream` | Main must emit sequenced `AgentStreamEvent` on `agent:stream` |
| M2 | Permission IPC missing | Optional `permissionHandler` / `autoAccept`; no IPC broker | Invokes `agent:permission:respond` | Add handler + pending-request map |
| M3 | Sequence numbers absent | No `sequence` field | Requires non-negative monotonic `sequence`; drops `<= lastSequence` | Allocate per local session in normalizer |
| M4 | Event discriminant mismatch | `event: 'delta' \| 'thinking' \| 'tool' \| …` | `type: 'text_delta' \| 'thinking_update' \| 'tool_call' \| …` | Normalizer rename + split |
| M5 | ProcessService drops new kinds | `handleBridgeEvent` handles `delta/done/error/tool/thinking/agent_task` only | Needs plan, permission, status, cancelled | Handle or bypass via normalizer side-path that still runs for those events |

### 10.2 Field-level schema mismatches

| # | Field | Runtime / ACP | Renderer contract | Fix |
| --- | --- | --- | --- | --- |
| M6 | Text events | `event:'delta'`, field `text` | `type:'text_delta'`, field `delta` | Rename |
| M7 | Thinking events | `event:'thinking'`, `text` | `thinking_update` + `mode` | Map; set `mode:'delta'` for ACP |
| M8 | `itemId` optional | May be undefined when ACP omits `messageId` | **Required string** for text/thinking | Synthesize stable ids (`msg-${n}`, `thought-${n}`) |
| M9 | Tools | Single `event:'tool'` + `isUpdate` boolean | Separate `tool_call` vs `tool_update` | Split on `isUpdate` |
| M10 | Tool title | Uses `name`; ACP `title` may be dropped | `tool_call.title` **required** (IPC parser enforces) | Always set `title` (fallback chain: ACP title → name → kind → `'Tool'`) |
| M11 | Tool result streaming | Passes `rawOutput` wholesale on updates | Expects append-only `resultDelta` / `output.text` | Diff previous raw/content; never send full cumulative blob as delta |
| M12 | Plan entries | ACP `PlanEntry`: `{ content, priority, status }` | `{ id, title, status }` | Map `title←content`; synthesize `id`; do not require `priority` in UI |
| M13 | Plan status `blocked` | Not in ACP v1 (`pending\|in_progress\|completed`) | Allows `blocked` | Only legacy adapters may emit `blocked` |
| M14 | Permission options | ACP `name` | Renderer `label` | Map `label←name` |
| M15 | Permission `requestId` | Not set on bridge permission events | Required; used for respond correlation | Use JSON-RPC request id |
| M16 | Permission default | Without handler and without `autoAccept`, outcome is **cancelled** | UI expects interactive approval | Wire UI handler; stop silent cancel when normalized streaming enabled |
| M17 | Cancel terminal type | Abort path emits `event:'done'` with `stopReason:'cancelled'` | Distinct `type:'cancelled'` | Map `stopReason==='cancelled'` → `cancelled` event (not `done`) |
| M18 | Status vocabulary | `phase: 'ready'\|'running'\|'idle'\|'usage'\|'mode'|…` | `status: 'starting'\|'running'\|'waiting'\|'idle'` | Map phases; put details in `message` |
| M19 | Error field name | `error: string` on bridge error | `message: string` on stream error | Rename |
| M20 | Envelope `sessionId` | Bridge may carry remote conversation id in `conversationId` | Stream events need **local** ABF session id | Normalizer always stamps local id from ProcessService context |

### 10.3 Protocol fidelity mismatches

| # | Issue | Detail | Fix |
| --- | --- | --- | --- |
| M21 | Non-schema prompt `usage` | Adapter reads `response.usage` from `session/prompt`, but stable v1 `PromptResponse` only requires `stopReason` | Prefer `usage_update` notifications; treat prompt `usage` as optional if an agent sends extension data |
| M22 | `plan_update` / `plan_removed` handling | Runtime switch includes these update kinds | **Not** present as stable v1 `SessionUpdate` discriminators in public `schema/v1/schema.json`. Ignore or gate behind explicit experimental support; do not require them for v1 agents |
| M23 | `clientCapabilities: { plan: {} }` | Advertises experimental plan update support (SDK schema allows `plan?: PlanCapabilities`) | Keep while plan_update / plan_removed are mapped into the stream |
| M24 | MCP transport assert | Only `http` / `sse` are validated; experimental MCP-over-ACP transport is not constructed or required | Do not reintroduce `mcpCapabilities.acp` gates unless ABF can actually open ACP-tunneled MCP |
| M25 | Dual chat paths | Legacy patches still emit during tool/text | When normalized stream active, either suppress legacy patches for that session or accept renderer ignore rules; still persist history server-side |

### 10.4 Lifecycle / UX mismatches

| # | Issue | Fix |
| --- | --- | --- |
| M26 | Stop button vs terminal events | Renderer enters `cancelling` immediately; main must eventually emit `cancelled` or `error`, not only clear legacy streaming |
| M27 | Permission UI stuck on failed respond | Return `{ accepted:false, error }` or throw; renderer keeps card visible |
| M28 | `autoAccept` vs panel | Auto-accepted permissions should not leave a stuck `waiting_permission` phase—emit no request, or emit request+immediate resolution consistently (prefer: do not show UI when auto-accepted) |

---

## 11. Process cleanup matrix

| Trigger | Adapter | Permissions | Child process | Renderer |
| --- | --- | --- | --- | --- |
| Turn cancel (Stop) | `session/cancel` + abort | cancel pending | keep alive if healthy | `cancelling` → `cancelled` |
| Prompt complete | emit terminal | none | keep alive | `done` |
| Init failure | destroy | n/a | SIGTERM/KILL | session error via legacy and/or `error` |
| Unexpected exit | `emitFatal` | cancel pending | already dead | `error` |
| Session delete / re-init | `destroy()` | cancel | close+kill | clear stream state |
| App quit | `BridgeManager.destroyAll` | cancel all | kill all | n/a |

---

## 12. Test matrix

### 12.1 Unit / component (already partially present)

| Area | Cases |
| --- | --- |
| AcpAdapter + fake agent | initialize v1; wrong version fails; hang timeout; crash on start; malformed stdout; prompt stream text/thinking/tool/plan/permission; cancel; destroy SIGTERM; load session; image blocks always forwarded |
| StreamNormalizer | every BridgeEvent kind → AgentStreamEvent; sequence monotonic; itemId synthesis; plan field map; permission label/requestId; cancel mapping |
| agentStreamCore reducer | ignore old sequence; text append; thinking delta/replace; tool upsert; plan replace; permission wait; terminal finalize |
| agentStreamIpc parser | reject malformed payloads; accept golden fixtures |
| AgentActivityPanel | option click; error on reject; focus management |

### 12.2 Integration

| Case | Expect |
| --- | --- |
| Native ACP end-to-end in Electron | user message → `agent:stream` deltas → tool permission UI → allow → tool complete → `done` |
| Cancel mid-permission | pending permission cancelled; stream `cancelled` |
| Cancel mid-text | `session/cancel`; no hang beyond shutdown timeout |
| Legacy Claude path with flag off | unchanged `chat:*` behavior |
| Legacy path with normalized flag on | dual-emit safe; no duplicated assistant text in UI |
| Resume with `loadSession` | remote session restored; new sequences continue locally |
| MCP http server configured without capability | init fails clearly |
| App quit during prompt | no orphan node processes |

### 12.3 Conformance / protocol

| Case | Expect |
| --- | --- |
| Negotiate only v1 | reject v2-only agents |
| StopReason set coverage | `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled` |
| Permission kinds | all four option kinds round-trip |
| No experimental imports | CI grep forbids `@agentclientprotocol/sdk/experimental` in production entrypoints |

---

## 13. Third-party license assumptions (from package metadata)

Verified from npm registry / package metadata (not from vendored copies of unrelated apps):

| Package | Declared license | Role | Integration assumption |
| --- | --- | --- | --- |
| `@agentclientprotocol/sdk@1.3.0` | **Apache-2.0** | Official ACP TypeScript SDK (runtime commit dependency) | Safe to depend on in main process; retain Apache notice when redistributing SDK code; pin exact version in lockfile |
| ACP schema repository artifacts | Apache-2.0 (upstream project license) | Protocol definition | Spec reference only in this doc; no code copy required |
| `@anthropic-ai/claude-agent-sdk` | (existing product dependency; leave as currently declared in tree) | Legacy Claude path | Unchanged by ACP native profile |
| Electron / React / Vite stack | existing project deps | App shell | Unchanged |

**Product license note:** this repository’s root `LICENSE` is **PolyForm Noncommercial 1.0.0**. Apache-2.0 dependencies are usable under typical open-source dependency practice, but distribution of the combined work remains subject to AllBeingsFuture’s own license terms. Integration should not relicense the ACP SDK.

Streaming commit `91263ef` adds **no** new npm dependency (renderer remains SDK-free)—preferred.

Runtime commit `19f91b8` adds `@agentclientprotocol/sdk` `1.3.0` to the root `package.json` / lockfile—required for native ACP.

---

## 14. Recommended module layout (integration target)

```text
electron/
  bridge/
    adapters/acp.ts          # native ACP transport (runtime slice)
    types.ts                 # BridgeEvent SPI
    bridge.ts                # factory
    stream-normalizer.ts     # NEW: BridgeEvent → AgentStreamEvent
    permission-broker.ts     # NEW: pending permission RPC
  services/process.ts        # emit agent:stream; wire broker; don’t drop events
  ipc/handlers.ts            # agent:permission:respond
frontend/
  src/types/agentStreamTypes.ts
  src/core/chat/agentStreamCore.ts
  src/hooks/agentStreamIpc.ts
  src/components/conversation/AgentActivityPanel.tsx
  docs/acp-renderer-streaming.md  # renderer-local contract notes
docs/
  acp-architecture.md        # this file (system architecture)
```

---

## 15. Success criteria

Integration is complete when:

1. A native ACP fake agent and at least one real ACP-capable CLI complete a prompt turn with text, thinking, tool, plan, and permission events visible in ABF UI.
2. Cancel is reliable (permission + prompt) without orphan processes.
3. Legacy providers still work with normalized streaming disabled.
4. No production import of experimental ACP v2.
5. All mismatches **M1–M28** are closed or explicitly waived with tests.

---

## 16. Document control

| Item | Value |
| --- | --- |
| Architecture only | Yes — no code changes in this deliverable beyond this file |
| Runtime reference SHA | `19f91b8` |
| Streaming reference SHA | `91263ef` |
| Stable protocol version | `1` |
| Pinned SDK (runtime lineage) | `@agentclientprotocol/sdk@1.3.0` (Apache-2.0) |
| Spec schema | `https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json` |
