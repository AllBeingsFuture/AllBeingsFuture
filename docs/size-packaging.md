# Packaging size: host CLIs (no embedded Codex / Claude natives)

## Product decision

**Install packages must not ship Codex / Claude platform-native binaries** (hundreds of MB).  
Runtime resolution matches **Grok Build**: use the **host-installed CLI** (PATH, user settings, env overrides) — not a bundled `codex-darwin-*` / `claude-agent-sdk-darwin-*` payload.

| Layer | What ships in the `.app` / installer | What the user must install |
|-------|--------------------------------------|----------------------------|
| Grok | Nothing native | Grok Build CLI (`grok`) |
| Codex | Optional thin **JS** ACP wrapper (`@agentclientprotocol/codex-acp`) | Host **`codex`** CLI |
| Claude | Optional thin **JS** ACP wrapper (`@agentclientprotocol/claude-agent-acp`) | Host **Claude Code** CLI |
| Gemini / OpenCode / … | Nothing | Their respective CLIs |

`npm install` / `node_modules` in a **dev** checkout may still download large optional platform packages. That is fine for local development. **electron-builder must exclude them from the production payload.**

## electron-builder configuration

Source of truth: root `package.json` → `build.files` / `build.asarUnpack`.

### `build.files` excludes (native / vendor)

```
!**/node_modules/@openai/codex-*/**
!**/node_modules/@openai/codex/vendor/**
!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**
!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/**
!**/node_modules/@anthropic-ai/claude-agent-sdk/cli.js
!**/node_modules/@img/sharp-*/**
```

These patterns strip platform packages such as:

- `@openai/codex-darwin-arm64` / `codex-darwin-x64` / linux / win32 (~300MB class)
- `@anthropic-ai/claude-agent-sdk-darwin-*` / linux / win32 (~245MB class)
- SDK `vendor/` trees and fat `cli.js` when present

### `build.asarUnpack` (thin wrappers only)

Unpack **only** spawnable JS wrappers and small peers:

- `@agentclientprotocol/claude-agent-acp`
- `@agentclientprotocol/codex-acp`
- `@agentclientprotocol/sdk`
- `zod`

**Do not** asarUnpack `@openai/codex*`, `@anthropic-ai/claude-agent-sdk*`, or other platform packages.

### Dependencies

- Direct product deps: ACP wrappers + `@agentclientprotocol/sdk` + `zod` (+ app libs).
- **No** direct `@anthropic-ai/claude-agent-sdk` product dependency (wrapper may pull a **JS** nested copy for settings; platform optional deps are excluded from pack).
- Transitive `@openai/codex` meta package is tiny; **platform** optional deps are excluded from pack.

## Runtime path resolution (same idea as Grok)

Shared helpers: `electron/services/cli-path-resolve.ts`.

| Provider | ACP launch command | Host binary env | Other config |
|----------|--------------------|-----------------|--------------|
| Grok Build | `grok` + `agent stdio` | `GROK_PATH` | Provider `executablePath` |
| Codex | `codex-acp` (JS wrapper) | `CODEX_PATH` → host `codex` | Provider `executablePath` |
| Claude Code | `claude-agent-acp` (JS wrapper) | `CLAUDE_CODE_EXECUTABLE` / `CLAUDE_PATH` → host `claude` | Provider `executablePath` |

Search order for host CLIs:

1. Provider **executable path** (settings)
2. Explicit env override
3. Well-known user bins (`~/.grok/bin`, `~/.npm-global/bin`, `~/.local/bin`, Homebrew, …)
4. `PATH` (Electron GUI launches also get common bins prepended in `buildChildProcessEnv`)

If neither a host CLI nor a **dev-only** optional platform package is available, session start fails with a clear **CLI not found** message (install hint + env vars).

## User setup

```bash
# Grok
# install per xAI docs → ensure `grok` on PATH, or export GROK_PATH=/path/to/grok

# Codex
npm i -g @openai/codex
# or official installer; then:
export CODEX_PATH="$(which codex)"   # optional if on PATH

# Claude Code
# install Claude Code CLI; then:
export CLAUDE_CODE_EXECUTABLE="$(which claude)"   # optional if on PATH
# CLAUDE_PATH is also accepted by ABF resolution
```

In the app: **Settings → Providers → executable path** for a specific binary.

## Verification

```bash
# Unit / backend contracts (includes packaging config assertions)
npm run test:backend

# Optional full pack (slow): confirm natives absent from output
npm run pack:mac:arm64   # or pack / electron-builder --dir
# Then search the unpacked app, e.g.:
#   find release -iname '*codex-darwin*' -o -iname '*claude-agent-sdk-darwin*'
# Expect no large vendor binaries under app.asar.unpacked for those packages.
```

Approximate sizes when **wrongly** packed (for regression awareness, measured on a full dev `node_modules`):

| Package | Order of magnitude |
|---------|--------------------|
| `@openai/codex-darwin-arm64` | ~300 MB |
| `@anthropic-ai/claude-agent-sdk-darwin-arm64` | ~245 MB |
| `@agentclientprotocol/codex-acp` (JS) | ~1 MB |
| `@agentclientprotocol/claude-agent-acp` (JS) | ~5 MB |

After excludes, production payloads should only carry the thin JS wrappers (plus sdk/zod), not the platform CLI trees.
