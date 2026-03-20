# AllBeingsFuture (ABF) — AI Agent 开发指引

## 项目概述

AllBeingsFuture 是一个 Electron + React 多 Agent AI 工作台，支持多 AI Provider 编排调度。

## 技术栈

- **Runtime**: Electron 33 (main + renderer)
- **Frontend**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **Backend**: better-sqlite3, node-pty, Claude Agent SDK
- **AI Providers**: Claude Code SDK (in-process), Codex CLI (subprocess JSON-RPC), Gemini CLI, OpenCode
- **Build**: electron-builder (Win NSIS installer)
- **Test**: Vitest + JSDOM + @testing-library/react

## 项目结构

```
electron/
├── main.ts                    # Electron 入口，窗口管理，IPC 路由
├── preload.ts                 # Context isolation bridge
├── bridge/
│   ├── bridge.ts              # BridgeManager: Provider adapter 生命周期
│   ├── adapters/              # claude.ts, codex.ts, gemini.ts, opencode.ts
│   ├── ProviderCapabilityRegistry.ts  # Provider 能力声明
│   ├── runtime.ts             # 跨平台命令解析
│   └── toolMapping.ts         # Provider 工具 → 统一事件映射
├── parser/                    # CLI 输出解析引擎
│   ├── OutputParser.ts        # 原始输出 → 结构化事件
│   ├── StateInference.ts      # 会话状态推断
│   └── *Rules.ts              # 各 Provider 解析规则
├── services/                  # 42 个服务模块
│   ├── process.ts             # 消息处理、Agent 生命周期、idle 检测
│   ├── session.ts             # 会话管理与持久化
│   ├── database.ts            # SQLite 数据库
│   ├── agent-api.ts           # 子 Agent HTTP API
│   └── ...
└── ipc/handlers.ts            # 50+ IPC channel 路由

frontend/src/
├── stores/                    # 30+ Zustand store
├── components/                # UI 组件 (conversation, file-manager, layout, etc.)
├── hooks/                     # 自定义 Hooks
├── utils/                     # 工具函数
└── test/                      # 测试配置

mcps/                          # MCP Servers
├── agent-control/             # 子 Agent 生命周期管理
├── web-search/                # 网页搜索
└── chrome-devtools/           # 浏览器自动化

skills/                        # 60+ 内置 Skill 模板
```

## 核心架构

### 多 Agent 编排链路

```
Claude Code (Supervisor)
  → agent-control MCP Server (mcps/agent-control/server.mjs)
    → HTTP → AgentApi (electron/services/agent-api.ts)
      → ProcessService + BridgeManager → Provider Adapter
```

### Provider 别名映射

| 用户输入 | 实际 Adapter |
|---------|-------------|
| claude / claude-code | claude-sdk (in-process) |
| codex / codex-cli | codex-appserver (subprocess) |
| gemini / gemini-cli | gemini-headless |
| opencode / opencode-cli | opencode-sdk |

## 开发命令

```bash
npm run dev              # 启动开发 (Electron + Vite 并行)
npm run build            # 构建 renderer + electron
npm run pack             # 打包 Windows NSIS 安装包
cd frontend && npm test  # 运行前端测试
```

## 开发规范

### 模块边界

- **bridge 层**：只负责 Provider 通信，不处理业务逻辑
- **services 层**：核心业务层，状态管理和流程控制
- **parser 层**：只负责输出解析，不反向调用其他层
- **ipc/handlers.ts**：薄路由层，只做参数透传
- **frontend stores**：UI 状态管理，通过 IPC 调用 Electron 服务

### 文件修改注意

- 改 `electron/` 下 TypeScript → 需要 `npm run build:electron` 重编译
- `node-pty` 和 `better-sqlite3` 是 native 模块，在 `asarUnpack` 中
- MCP servers 和 skills 作为 `extraResources` 打包，不进 asar
- 新增 IPC channel 需在 `handlers.ts` 注册并在 `preload.ts` 暴露

### Commit 规范

格式：`<type>: <描述>`

- `feat` — 新功能
- `fix` — Bug 修复
- `refactor` — 重构
- `chore` — 构建/依赖/配置
- `docs` — 文档
- `test` — 测试

### 测试规范

- 测试文件放在 `__tests__/` 目录下，命名 `<name>.test.tsx`
- 使用 `frontend/src/test/render.tsx` 的自定义 render
- mock Electron IPC: `window.electron.invoke`
- 新增组件至少写渲染测试，修 bug 补回归测试

### Git 工作流

- 主分支 `main`，不直接在 main 上开发
- 通过 worktree 或功能分支开发
- 合并用 `--no-ff`
- 远程：`origin` (GitHub) + `gitee` (Gitee 镜像)
- 永远不要 force push main
- 推送前确认 `npm run build` 通过

### 禁止提交

- `.env`、API Key、数据库文件 (`.db`)
- `node_modules/`、`electron/dist/`、`frontend/dist/`
