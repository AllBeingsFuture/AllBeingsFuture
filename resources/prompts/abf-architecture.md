# AllBeingsFuture 项目架构规则

## 项目定位

AllBeingsFuture (ABF) 是一个 Electron + React 多 Agent AI 工作台，支持多 AI Provider 编排调度。

## 技术栈

- **Runtime**: Electron 33 (main + renderer 双进程)
- **Frontend**: React 18 + TypeScript 5.7 + Vite 6 + Zustand 5 + TailwindCSS 3
- **Backend**: better-sqlite3 (SQLite)、node-pty (伪终端)、Claude Agent SDK
- **AI Providers**: Claude Code SDK (in-process)、Codex CLI (subprocess JSON-RPC)、Gemini CLI、OpenCode
- **Build**: electron-builder → Windows NSIS 安装包
- **Test**: Vitest + JSDOM + @testing-library/react

## 目录结构与模块职责

```
electron/                        # Electron 主进程
├── main.ts                      # 入口：窗口、IPC、SQLite 初始化、系统托盘
├── preload.ts                   # Context Isolation 桥接
├── bridge/                      # Provider 适配层
│   ├── bridge.ts                # BridgeManager: 适配器生命周期管理
│   ├── adapters/                # 各 Provider 的适配器实现
│   ├── ProviderCapabilityRegistry.ts  # Provider 能力声明（MCP/Skill/SystemPrompt）
│   ├── runtime.ts               # 跨平台命令解析，Git Bash 检测
│   └── toolMapping.ts           # Provider 工具 → 统一 ActivityEventType
├── parser/                      # CLI 输出解析引擎
│   ├── OutputParser.ts          # 原始输出 → 结构化事件
│   ├── StateInference.ts        # 会话状态推断
│   └── *Rules.ts                # 各 Provider 专用解析规则
├── services/                    # 42 个服务模块 (~9000 LOC)
│   ├── process.ts               # 核心：消息处理、Agent 生命周期、idle 检测
│   ├── session.ts               # 会话管理与持久化
│   ├── database.ts              # SQLite 表：providers/sessions/messages/mcp_servers/skills
│   ├── agent-api.ts             # 子 Agent HTTP API (localhost 随机端口)
│   ├── agent-tracker.ts         # SDK task event → 子会话追踪
│   ├── supervisor-prompt.ts     # 动态注入 .claude/rules/abf-*.md
│   ├── concurrency-guard.ts     # 并发会话限制 + 内存阈值监控
│   ├── message-scheduler.ts     # 消息队列 (immediate / queue_after_turn)
│   ├── skill-engine.ts          # Skill 模板展开、变量解析、斜杠命令
│   ├── notification-manager.ts  # 通知管理（DND、去重、分类型开关）
│   └── git.ts                   # Git worktree 操作
└── ipc/handlers.ts              # 50+ IPC channel 路由

frontend/src/                    # React 渲染进程
├── stores/                      # 30+ Zustand store
├── components/                  # UI 组件
│   ├── conversation/            # 聊天界面、消息气泡、工具执行 UI
│   ├── file-manager/            # CodeViewer (Monaco)、DiffViewer、文件浏览
│   ├── layout/                  # AppLayout 分栏布局 (allotment)
│   ├── terminal/                # xterm.js 终端
│   ├── git/                     # Git worktree 管理 UI
│   ├── dashboard/               # Token 用量仪表盘 (recharts)
│   ├── kanban/                  # 任务看板
│   └── settings/                # 设置面板
├── hooks/                       # 自定义 Hooks
├── utils/                       # 工具函数
└── test/                        # 测试配置与 helpers

mcps/                            # MCP Servers (extraResources 打包)
├── agent-control/               # 核心：子 Agent 生命周期管理
├── web-search/                  # 网页搜索
└── chrome-devtools/             # 浏览器自动化

skills/                          # 60+ 内置 Skill 模板 (extraResources 打包)
```

## 核心架构链路

### 多 Agent 编排

```
Claude Code (Supervisor Agent)
  → agent-control MCP Server (mcps/agent-control/server.mjs, stdio)
    → HTTP → AgentApi (electron/services/agent-api.ts, localhost:随机端口)
      → ProcessService + BridgeManager
        → 创建 DB 会话 + 启动 Provider Adapter
```

### IPC 通信

```
Frontend (React)
  → window.electron.invoke(channel, args)    # preload 暴露
    → ipcMain.handle(channel, handler)        # electron/ipc/handlers.ts 路由
      → 调用 services 层处理
```

### 数据持久化

- SQLite (better-sqlite3)：providers、sessions、messages、mcp_servers、skills
- electron-store：用户设置

## 开发规范

### 模块边界

1. **bridge 层只负责 Provider 通信**，不处理业务逻辑
2. **services 层是核心业务层**，所有状态管理和流程控制在这里
3. **parser 层只负责输出解析**，不反向调用 bridge 或 services
4. **ipc/handlers.ts 是薄路由层**，只做参数透传，不包含业务逻辑
5. **frontend stores 是 UI 状态管理**，通过 IPC 调用 Electron 服务

### 文件修改注意事项

- 改 `electron/` 下 TypeScript → 需要 `npm run build:electron` 重编译
- `node-pty` 和 `better-sqlite3` 是 native 模块，在 `asarUnpack` 中
- MCP servers 和 skills 作为 `extraResources` 打包，不进 asar
- `.claude/rules/abf-*.md` 是动态注入的，不要手动编辑（会被覆盖）
- 新增 IPC channel 需要在 `handlers.ts` 注册并在 `preload.ts` 暴露

### 状态管理

- Electron 主进程：服务类单例 + SQLite 持久化
- Frontend：Zustand store（30+ 个独立 store，按功能拆分）
- 跨进程通信：只通过 IPC，不共享内存
