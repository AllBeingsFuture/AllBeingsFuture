<div align="center">

# AllBeingsFuture

**Multi-Agent AI Workbench for Desktop**

[![Electron 33](https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Claude Agent SDK](https://img.shields.io/badge/Claude_Agent_SDK-0.2-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![License](https://img.shields.io/badge/License-BSD_3--Clause-green?style=flat-square)](LICENSE)

</div>

## What is AllBeingsFuture?

AllBeingsFuture (ABF) is a desktop AI workbench built with Electron and React. It orchestrates multiple AI providers — Claude, Codex, Gemini, OpenCode — through a unified interface, with Claude as the supervisor agent that can spawn and manage child agents in real time.

## Architecture

```
Electron Main Process
├── BridgeManager ─── Provider Adapters (Claude SDK / Codex CLI / Gemini CLI / OpenCode)
├── ProcessService ── Session lifecycle, idle detection, message scheduling
├── AgentApi ──────── HTTP server (localhost) for child agent management
├── OutputParser ──── Normalizes provider output → unified ActivityEvent stream
├── Database ──────── SQLite (better-sqlite3) for sessions, messages, providers
├── SkillEngine ───── 60+ skill templates, slash commands, variable expansion
├── PTY ───────────── Embedded terminal via node-pty
└── IPC Handlers ──── 50+ channels bridging main ↔ renderer

React Renderer (Vite)
├── 30+ Zustand stores ── sessionStore, fileManagerStore, gitStore, usageStore ...
├── Conversation UI ───── Chat, message bubbles, tool execution display
├── File Manager ──────── Monaco Editor, DiffViewer, file browser
├── Terminal ──────────── xterm.js integrated terminal
├── Git Worktree UI ───── Visual worktree management
├── Dashboard ─────────── Token usage charts (Recharts)
├── Kanban ────────────── Task board
└── Settings Panel ────── Provider config, MCP servers, notifications

MCP Servers (extraResources)
├── agent-control ──── Core: spawn / send / list / close child agents
├── web-search ─────── Web search integration
└── chrome-devtools ── Browser automation
```

## Multi-Agent Orchestration

The core design: Claude Code SDK runs as the **supervisor agent** in-process. It communicates with a local `agent-control` MCP server that exposes tools to manage child agents:

| Tool | Description |
|------|-------------|
| `spawn_agent` | Create a child agent session with any provider |
| `send_to_agent` | Send follow-up messages to a running child agent |
| `wait_agent_idle` | Block until a child agent finishes its current task |
| `get_agent_output` | Retrieve child agent output |
| `list_agents` | List all active child agents |
| `close_agent` | Terminate a child agent session |

Child agents can be any supported provider. The supervisor decides which provider fits each subtask.

## Supported Providers

| Provider | Adapter | Communication | MCP Support | Best For |
|----------|---------|---------------|-------------|----------|
| Claude Code | `claude-sdk` | In-process SDK | Native | Complex reasoning, multi-file refactoring, supervision |
| Codex CLI | `codex-appserver` | Subprocess JSON-RPC | Prompt injection | Code generation, bug fixes |
| Gemini CLI | `gemini-headless` | CLI subprocess | None | Large file analysis, code review, summarization |
| OpenCode | `opencode-sdk` | SDK/CLI | Native | Code generation and completion |

## Skills

ABF ships with **60+ built-in skills** covering:

- Code: `code-review`, `frontend-design`, `mcp-builder`, `webapp-testing`
- Documents: `pdf`, `docx`, `pptx`, `xlsx`, `ppt-creator`, `translate-pdf`
- Content: `chinese-writing`, `chinese-novelist`, `content-research-writer`, `summarizer`
- Media: `image-understanding`, `video-downloader`, `youtube-summarizer`
- Social: `xiaohongshu-creator`, `wechat-article`, `bilibili-watcher`
- Automation: `github-automation`, `gmail-automation`, `google-calendar-automation`, `todoist-task`
- Development workflow: `superpowers-*` series (debugging, TDD, git worktrees, verification, etc.)

Skills are template-based and extensible via the `skill-creator` skill.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 33 (main + renderer) |
| Frontend | React 18, Vite 6, Zustand 5, TailwindCSS 3 |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| Layout | Allotment (split panes) |
| Charts | Recharts |
| Database | better-sqlite3 (SQLite) |
| AI Core | @anthropic-ai/claude-agent-sdk |
| Process | node-pty (pseudo-terminal) |
| Build | electron-builder → Windows NSIS |
| Test | Vitest + JSDOM + @testing-library/react |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Windows 10/11 (primary target)
- Git

### Install & Run

```bash
git clone https://github.com/anthropics/AllBeingsFuture.git
cd AllBeingsFuture

# Install dependencies (also installs frontend deps via postinstall)
npm install

# Start in development mode (Electron + Vite dev server)
npm run dev

# Build for production
npm run build

# Package Windows installer
npm run pack
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both Electron and Vite dev server |
| `npm run dev:renderer` | Start only the Vite dev server |
| `npm run dev:electron` | Compile and start Electron |
| `npm run build` | Build both renderer and Electron |
| `npm run pack` | Build and package as Windows NSIS installer |
| `cd frontend && npm test` | Run frontend tests |

## Project Structure

```
electron/
├── main.ts                  # Entry: window, IPC, SQLite, tray
├── preload.ts               # Context isolation bridge
├── bridge/
│   ├── bridge.ts            # BridgeManager: adapter lifecycle
│   ├── adapters/            # claude.ts, codex.ts, gemini.ts, opencode.ts
│   ├── ProviderCapabilityRegistry.ts
│   ├── runtime.ts           # Cross-platform command resolution
│   └── toolMapping.ts       # Provider tools → unified ActivityEventType
├── parser/                  # CLI output → structured events
│   ├── OutputParser.ts
│   ├── StateInference.ts
│   └── *Rules.ts            # Per-provider parsing rules
├── services/                # ~40 service modules
│   ├── process.ts           # Core message handling, agent lifecycle
│   ├── session.ts           # Session management & persistence
│   ├── database.ts          # SQLite schema & queries
│   ├── agent-api.ts         # Child agent HTTP API
│   ├── agent-tracker.ts     # SDK task event → child session tracking
│   ├── supervisor-prompt.ts # Dynamic rule injection
│   ├── concurrency-guard.ts # Session limits + memory monitoring
│   ├── message-scheduler.ts # Message queue
│   ├── skill-engine.ts      # Skill template expansion
│   ├── git.ts               # Git worktree operations
│   └── ...                  # notification, provider, pty, usage, workflow, etc.
└── ipc/handlers.ts          # 50+ IPC channel routes

frontend/src/
├── stores/                  # 30+ Zustand stores
├── components/
│   ├── conversation/        # Chat UI, message bubbles, tool execution
│   ├── file-manager/        # Monaco editor, diff viewer, file browser
│   ├── layout/              # Split-pane layout (Allotment)
│   ├── terminal/            # xterm.js terminal
│   ├── git/                 # Worktree management UI
│   ├── dashboard/           # Token usage charts
│   ├── kanban/              # Task board
│   └── settings/            # Settings panel
├── hooks/
├── utils/
└── test/

mcps/                        # MCP servers (packaged as extraResources)
├── agent-control/           # Child agent lifecycle management
├── web-search/              # Web search
└── chrome-devtools/         # Browser automation

skills/                      # 60+ skill templates (extraResources)
```

## License

[BSD 3-Clause](LICENSE)
