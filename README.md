# AllBeingsFuture (ABF)

**本地多 Agent 编程工作台** — Electron + React 桌面应用，在统一 UI 中管理多 AI Provider 会话、MCP、Skills、Git Worktree 与父子 Agent 编排。

- **版本：** 1.5.1  
- **仓库：** [github.com/AllBeingsFuture/AllBeingsFuture](https://github.com/AllBeingsFuture/AllBeingsFuture)  
- **许可：** [PolyForm Noncommercial License 1.0.0](./LICENSE)  
- **appId：** `com.allbeingsfuture.app`

---

## 1. 项目定位

AllBeingsFuture 不是单一聊天客户端，而是面向「主 Agent（Supervisor）编排 + Worker 实现」的本地工作台：

- 统一接入多种 **CLI Agent（ACP v1 / stdio）** 与 **OpenAI 兼容 HTTP API**
- 会话、消息、Provider、MCP、Skills 等状态落在本地 SQLite
- 子 Agent 可走 **Git Worktree 隔离**，并通过内置 **`agent-control` MCP** 完成 spawn / send / close 编排
- 前端对流式输出做 **协议归一化后的统一渲染**（不按厂商分 UI）

角色分层（与 `resources/prompts/`、运行时 MCP 策略一致）：

```
爷爷 (Supervisor / top-level)  — 调度、验收、合并
  └─ 父亲 (Worker / direct-child) — 编排儿子 + 必要时实现
       └─ 儿子 (nested-child)     — 叶子实现者，不再 spawn
```

---

## 2. 核心能力

| 能力 | 说明 |
|------|------|
| 多 Provider | 内置 8 个 CLI Agent 预设（全部 ACP）；另支持用户配置 `openai-api` |
| 统一流式 | 后端 `AgentStreamNormalizer` → IPC `agent:stream` → 前端统一消息/工具/权限 UI |
| 多 Agent | `agent-control` MCP：`spawn_agent` / `send_to_agent` / `list_agents` / `close_agent` 等 |
| Worktree | `autoWorktree` 开启时子 Agent 在 `.allbeingsfuture-worktrees/` 下隔离 |
| MCP | 用户自配 MCP；会话策略按三代角色注入；mempalace 类 server 可自动经 safe proxy |
| Skills | 应用内安装 / 自定义（非内置 seed）；斜杠命令与模板展开 |
| 会话工作台 | 会话列表、对话区、Provider 管理、工作区设置、日志与反馈等 |

---

## 3. 技术栈

对照根目录与 `frontend/package.json`（当前 **1.5.1**）：

| 层 | 技术 |
|----|------|
| 桌面壳 | **Electron ^39**、`electron-builder` ^25 |
| 主进程 | TypeScript 5.7、`@agentclientprotocol/sdk` 1.3.0、薄 ACP wrapper 包（不含 Codex/Claude 平台二进制）、`zod`、`uuid` |
| 渲染层 | React 18、Vite 6、Zustand 5、Tailwind 3、allotment、react-markdown |
| 测试 | 后端：`node --test`（`npm run test:backend`）；前端：Vitest 3 + Testing Library（`cd frontend && npm test`） |
| 协议 | 内置 CLI：**ACP v1 stdio（NDJSON JSON-RPC）**；兼容 API：HTTP Chat Completions |

主进程入口：`electron/main.ts` → 编译产物 `electron/dist/main.js`。  
打包产物目录：`release/`（Windows NSIS / macOS DMG）。

---

## 4. 架构

### 4.1 主链路

```
Renderer (React)
  window.electronAPI.invoke / on
        │
        ▼
Preload (contextIsolation)
        │
        ▼
ipc/handlers + 各 *Service
        │
        ├─ SessionService     会话元数据、父子关系、worktree 字段
        ├─ ProcessService     启停、消息、流、权限、多 Agent 编排
        ├─ ProviderService    Provider CRUD / 内置 seed
        ├─ BridgeManager      按 adapterType 创建适配器
        │       ├─ AcpAdapter      （stdio ACP v1）
        │       └─ OpenAIAdapter   （HTTP，无 CLI）
        └─ 其它：MCP / Skill / Git / Mission / Workflow / Team …
```

启动要点（`electron/main.ts`）：

1. 单实例锁 → `Database` → `BridgeManager`
2. 注册 IPC handlers（Session / Process / Provider / …）
3. 创建 BrowserWindow（preload：`preload.cjs` / dev 下编译后的 preload）
4. 开发加载 `http://localhost:5173`，生产加载打包后的 frontend

### 4.2 适配器（现役 vs 已退休）

**磁盘上现役适配器只有两个：**

| adapterType | 实现 | 用途 |
|-------------|------|------|
| `acp` | `electron/bridge/adapters/acp.ts` | 全部内置 CLI Agent + 自定义 ACP |
| `openai-api` | `electron/bridge/adapters/openai.ts` | OpenAI 兼容 HTTP（非 agent 工具循环） |

**已退休（迁移/别名到 `acp`，不要当现役架构写）：**

- `claude-sdk`
- `codex-appserver`
- `gemini-headless`
- `opencode-sdk`

启动时会对历史内置行做幂等升级（`adapter_type=acp` + 规范 command/args）。

### 4.3 流式归一

```
Adapter BridgeEvent
  → ProcessService
  → AgentStreamNormalizer.normalize(sessionId, event)   # 单调 sequence
  → webContents.send('agent:stream', AgentStreamEvent)
  → frontend agentStreamIpc / agentStreamCore
  → ConversationView 统一渲染
```

主要事件类型：`text_delta`、`thinking_update`、`tool_call` / `tool_update`、`plan`、`status`、`permission_request`、`done` / `error` / `cancelled`。

要点：

- 前端 **不** 依赖 ACP SDK，**不** 按厂商分 UI
- 并存遗留通道 `chat:update` / `chat:patch`；归一流活跃时以前端 snapshot 规则为准
- 子 Agent 侧栏状态走 `agent:update`（与 `agent:stream` 分离）

### 4.4 子 Agent 与 agent-control

内置 runtime MCP：`electron/embedded-assets/mcps/agent-control/`（打包到 `resources/mcps/agent-control`）。

工具（经本地 `AgentApi` HTTP，仅 `127.0.0.1`）：

| 工具 | 作用 |
|------|------|
| `spawn_agent` | 异步创建持久子 Agent（默认 `wait=false`） |
| `send_to_agent` | 默认 queue 追加任务；`interrupt=true` 才打断当前回合 |
| `list_agents` / `get_agent_status` / `get_agent_output` | 列表与状态/输出 |
| `wait_agent_idle` | 等待当前 turn 结束 |
| `close_agent` | 终止子 Agent 并清理其隔离 worktree（**关闭前须合并成果**） |
| `list_sessions` / `get_session_summary` / `search_sessions` | 跨会话感知 |

**会话 MCP 策略（`session-mcp-policy.ts`）：**

| 角色 | agent-control |
|------|----------------|
| top-level（爷爷） | 可注入 |
| direct-child（父亲） | 可注入 |
| nested-child（儿子） | **永不**注入（叶子） |

Worktree 路径（`autoWorktree` + 父目录为 git 仓）：

```text
{repoRoot}/.allbeingsfuture-worktrees/{safeName}
```

兼容清理旧前缀 `.abf-worktrees/`。`close_agent` 仅删除 managed 子 worktree，不碰父目录与主仓。

---

## 5. 支持的 Provider

内置 seed 以 `BUILTIN_PROVIDER_DEFAULTS`（`electron/services/provider-defaults.ts`）为准。**全部 `adapterType: acp`**，经共享 `AcpAdapter`。

| id | 名称 | adapter | command | 默认 args | 备注 |
|----|------|---------|---------|-----------|------|
| `grok-build` | Grok Build | `acp` | `grok` | `agent stdio` | 默认 sortOrder 第一；可设 `GROK_PATH` / executable path |
| `claude-code` | Claude Code | `acp` | `claude-agent-acp` | （空） | 薄 JS ACP 包装可随应用；**本机 Claude Code CLI** 经 `CLAUDE_CODE_EXECUTABLE` / `CLAUDE_PATH` / PATH（不打包平台二进制） |
| `codex` | Codex CLI | `acp` | `codex-acp` | （空） | 薄 JS ACP 包装可随应用；**本机 `codex`** 经 `CODEX_PATH` / PATH（不打包 `@openai/codex-*`） |
| `gemini-cli` | Gemini CLI | `acp` | `gemini` | `--acp` | 原生 ACP |
| `opencode` | OpenCode | `acp` | `opencode` | `acp` | 子命令，不是 `--acp` |
| `qwen-code` | Qwen Code | `acp` | `qwen` | `--acp --experimental-skills` | |
| `kimi-cli` | Kimi CLI | `acp` | `kimi` | `acp` | 子命令 `kimi acp` |
| `github-copilot` | GitHub Copilot CLI | `acp` | `copilot` | `--acp` | |

**非内置 seed、运行时支持：**

| 类型 | 说明 |
|------|------|
| `openai-api` | 用户自定义 HTTP；`OPENAI_API_KEY` / `OPENAI_BASE_URL` 等；当前实现为非流式 Chat Completions，无 native MCP |

说明：

- 内置 Claude / Codex 的 **启动入口** 是 ACP 包装命令 **`claude-agent-acp` / `codex-acp`**（JS）；**平台原生 CLI 本体不打进安装包**，与 Grok 一样依赖本机安装
- 配置路径：Provider **executable path**，或环境变量 `GROK_PATH` / `CODEX_PATH` / `CLAUDE_CODE_EXECUTABLE`（亦接受 `CLAUDE_PATH`）
- 体积策略详见 [`docs/size-packaging.md`](./docs/size-packaging.md)
- UI 徽章：ACP 显示 **「ACP v1 / stdio」**；OpenAI 显示 **「OpenAI API」**
- `iflow` 等仅作展示/能力兼容，**不在**内置 seed 表

---

## 6. 系统要求

| 项 | 说明 |
|----|------|
| 操作系统 | macOS / Windows 桌面（Electron 39；有 mac arm64/x64 与 Windows NSIS 打包脚本） |
| Node.js | 建议 **20 或 22+**（仓库未写死 `engines`；`@types/node` ^22） |
| 外置 CLI | 按所用 Provider 安装对应 CLI（`grok`、**本机 `codex` / Claude Code**、`gemini`、`opencode`、`qwen`、`kimi`、`copilot` 等）并保证在 PATH 中；安装包**不**内嵌 Codex/Claude 平台二进制 |
| 打包 macOS | `electron-builder` 可能需要本机 Python（脚本中设置 `PYTHON_PATH=/usr/bin/python3`） |

---

## 7. 安装与开发

### 7.1 安装依赖

```bash
# 仓库根目录
npm install          # postinstall 会自动 frontend npm install
# 或手动
cd frontend && npm install && cd ..
```

### 7.2 开发

```bash
# 同时启动 Electron 主进程 + Vite 渲染层
npm run dev

# 仅渲染 / 仅主进程
npm run dev:renderer
npm run dev:electron
```

开发时渲染层默认：`http://localhost:5173`。

### 7.3 构建

```bash
npm run build                 # renderer + electron
npm run build:renderer        # frontend: tsc && vite build
npm run build:electron        # electron tsc + scripts/minify-electron.mjs
```

### 7.4 测试

```bash
# 后端（主进程）测试
npm run test:backend

# 前端测试
cd frontend && npm test
# 或监听模式
cd frontend && npm run test:watch
```

### 7.5 打包

```bash
npm run pack                  # Windows NSIS → release/
npm run pack:mac              # macOS arm64 + x64 DMG
npm run pack:mac:arm64
npm run pack:mac:x64
```

`electron-builder` 会把 frontend 产物、`agent-control`、`mempalace-safe`、`resources/prompts` 等写入 extraResources。

---

## 8. 首次使用

1. **启动应用**（开发：`npm run dev`；或安装打包产物）。
2. **设置 → AI Provider**：确认要用的内置 Provider 已启用；CLI 类需本机可执行文件可用（必要时填可执行路径 / 环境变量）。
3. **设置 → 工作区**：选择默认工作目录；按需开启 **autoWorktree**（默认倾向开启）。
4. **新建会话**：在会话侧栏创建会话，选择 Provider 与工作目录。
5. **对话**：发送任务；工具调用、思考、权限请求在统一对话 UI 中展示。
6. **多 Agent**：在支持 agent-control 注入的会话（爷爷/父亲）中，由 Agent 通过 MCP 工具 spawn 子 Agent；验收后合并 worktree 再 `close_agent`。
7. **MCP / Skills**：在应用内配置用户 MCP 与 Skills（非 Settings 内旧 catalog 页；侧栏/能力选择器路径以当前 UI 为准）。

默认设置倾向（DB 缺省）：`autoWorktree=true`、中文回复偏好、深色主题等——以 `SettingsService` / 库内 `settings` 为准。

---

## 9. 项目目录结构

```text
.
├── package.json                 # 应用 1.5.1、脚本、electron-builder
├── LICENSE                      # PolyForm Noncommercial 1.0.0
├── AGENTS.md                    # Worker 侧产品/协作规则入口
├── appicon.icns / appicon.ico
├── docs/
│   └── acp-architecture.md      # ACP 架构说明（若与代码冲突以代码为准）
├── resources/prompts/
│   ├── abf-supervisor.md        # 爷爷角色提示
│   └── abf-worker.md            # 父亲角色提示
├── scripts/
│   └── minify-electron.mjs
├── electron/
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts / preload.cjs
│   ├── bridge/                  # BridgeManager、AcpAdapter、OpenAIAdapter、runtime
│   ├── ipc/handlers.ts
│   ├── parser/                  # 输出解析 / 状态推断
│   ├── services/                # session、process、provider、mcp、skill、git…
│   ├── tracker/
│   ├── embedded-assets/
│   │   ├── mcps/
│   │   │   ├── agent-control/   # 子 Agent 编排 MCP
│   │   │   └── mempalace-safe/  # mempalace 写锁代理
│   │   └── skills/              # 仅说明；无内置 SKILL seed
│   └── tests/
└── frontend/
    ├── package.json             # React / Vite / Vitest
    ├── bindings/                # IPC 服务绑定类型
    ├── docs/
    │   └── acp-renderer-streaming.md
    └── src/
        ├── App.tsx
        ├── components/          # conversation、layout、settings、kanban…
        ├── stores/
        ├── core/chat/           # agentStreamCore 等
        ├── hooks/               # agentStreamIpc
        └── utils/providerDisplay.ts
```

### 当前主 UI（以代码为准）

- **ActivityBar：** 会话管理、Agent Teams 入口、设置
- **主区默认：** 会话 + `ConversationView`
- **设置 Tabs：** 通用、主题与外观、AI Provider、工作区、反馈、日志
- 代码中仍存在 Kanban / Mission / Workflow / Team 等面板实现；**ActivityBar 并非全部挂入口**。勿写已删除的独立 Shell 终端、静态 tools catalog、IM Bot（Telegram/QQ）等。

---

## 10. 本地数据位置

基目录：用户主目录下的 **`~/.allbeingsfuture/`**（Windows 为 `%USERPROFILE%\.allbeingsfuture\`）。

| 用途 | 路径 |
|------|------|
| SQLite 主库 | `~/.allbeingsfuture/allbeingsfuture.db` |
| 应用日志 | `~/.allbeingsfuture/logs/app-YYYY-MM-DD.log` |
| 启动日志 | `~/.allbeingsfuture/startup.log` |
| 贴纸缓存 | `~/.allbeingsfuture/stickers/` |
| 自定义解析规则 | `~/.allbeingsfuture/custom-rules.json` |
| Settings | 存于 DB `settings` 表（无独立 settings 文件） |
| 会话 Worktree | `{repo}/.allbeingsfuture-worktrees/...` |
| MemPalace 写锁（safe proxy） | `~/.mempalace/locks/abf_write.lock`（可由环境变量调整） |

---

## 11. MCP / Skill / Supervisor 规则

### 11.1 内置 runtime（非用户 MCP 市场 catalog）

| 名称 | 路径 | 作用 |
|------|------|------|
| **agent-control** | `electron/embedded-assets/mcps/agent-control` | 多 Agent 编排；会话按角色注入 |
| **mempalace-safe** | `electron/embedded-assets/mcps/mempalace-safe` | 用户启用的 mempalace 类 MCP 透明代理（写锁 + 重试） |

**没有** 内置的用户可见 MCP 列表（如已移除的 `web-search`、`chrome-devtools` 等 **不要** 再当作功能写）。  
`MCPService` 启动会 purge 历史 `builtin-*` 伪内置项。

### 11.2 Skills

- `BUILTIN_SKILLS = []`：不预装、不 seed 内置 Skill 文件
- 用户通过应用安装 / 自定义写入 DB（`marketplace` / `custom`）
- 运行期：斜杠命令、模板变量、参数展开（`SkillEngine`）

### 11.3 Supervisor / Worker 提示注入

模板：`resources/prompts/abf-supervisor.md`、`abf-worker.md`。

| 场景 | 行为概要 |
|------|----------|
| 爷爷 + Claude 类 | 写入工作区 `.claude/rules/abf-supervisor.md` |
| 父亲 + Claude 类 | 写入 `.claude/rules/abf-worker.md` |
| 其它 CLI | 维护工作区 `AGENTS.md` 中 `<!-- ABF:CODEX-RULES:... -->` 块；部分 Provider 另写 `GEMINI.md` / `QWEN.md` |
| 儿子 | **默认不**注入软件 Worker 提示词 |

已不再注入旧 common / providers / git / codex 长手册。

---

## 12. 仓库与版本

| 项 | 值 |
|----|-----|
| 名称 | `allbeingsfuture` |
| 版本 | **1.5.1** |
| 仓库 | https://github.com/AllBeingsFuture/AllBeingsFuture |
| Electron | ^39（勿按旧文档写 33） |
| 协议主路径 | 内置 CLI → **ACP v1 stdio**；兼容 HTTP → **openai-api** |

---

## 贡献提示

1. 改 Provider 预设时只信 `provider-defaults.ts` 与官方 ACP registry / CLI help，勿臆造 command。  
2. 架构描述以 `electron/bridge/`、`process.ts`、`agent-stream-*` 与前端 `agentStream*` 为准；历史文档可能滞后。  
3. 提交前跑：`npm run test:backend` 与 `cd frontend && npm test`。  
4. 不要恢复已删除的 Bot 集成、Shell 终端面板、内置 web-search/chrome-devtools MCP 等。

---

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE)  
Required Notice: Copyright 2026 AllBeingsFuture
