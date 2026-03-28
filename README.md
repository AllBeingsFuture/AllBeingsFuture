# AllBeingsFuture
前提声明！
本来以为L站是一个很好的社区 进来了两天 发现也就那样 除了能白嫖ai 其他没啥亮点
之前L站可能是个好社区 现在味道变了 事逼挺多的 可能是天天白嫖源码或者什么
对开源的东西要求特别高 我自己遇到别人开源的东西 起码都会体验一下 在L站上 体验没有体验就说项目有问题什么的 
L站以注销 以后看看会不会有变化 
tg 交流群
https://t.me/AllBeingsFuture

AllBeingsFuture 是一个面向多 Agent 协作场景的桌面 AI 工作台，基于 Electron + React 构建，聚焦于把不同 AI Provider、会话、子 Agent、MCP、Skill、Git Worktree 和本地开发环境整合到同一个应用里。

当前版本：`v1.5.0`

仓库地址：

- GitHub: `https://github.com/AllBeingsFuture/AllBeingsFuture`
- Gitee: `https://gitee.com/AllBeingsFuture/AllBeingsFuture`

## 项目定位

这个项目不是单纯的聊天壳子，而是一个偏工程化的 AI 协作桌面端，目标是解决下面几类问题：

- 同时管理多个 AI Provider，不在不同 CLI、网页和窗口之间来回切换
- 让主 Agent 可以派生子 Agent，并把执行过程、消息和工具调用收敛到统一界面
- 把 MCP、Skill、Prompt 注入、会话持久化和工作区隔离做成内建能力
- 面向真实代码仓库工作，支持 Git Worktree、文件浏览、Diff、终端和会话恢复

## 核心能力

- 多 Provider 统一调度：内置 `Claude Code`、`Codex CLI`、`Gemini CLI`、`OpenCode`
- 多 Agent 协作：支持 Supervisor 派生子 Agent，会话关系持久化
- Provider 适配层：不同 CLI/SDK 输出统一解析为结构化事件和 UI 活动流
- MCP 集成：内置 `agent-control`、`web-search`、`chrome-devtools` 等 MCP Server
- Skill 系统：项目自带大量 Skill 模板，支持 Prompt 模板、变量和兼容 Provider 控制
- Git Worktree 隔离：适合多任务并行开发，减少不同 Agent 修改同一工作区的冲突
- 会话持久化：Provider、Session、Task、Workflow、Mission、Team、Skill、MCP 配置全部本地保存
- 开发工具链：内置终端、文件浏览、Monaco 编辑/查看、消息流、活动时间线、搜索和历史面板
- 数据可追踪：支持会话状态、子 Agent 生命周期、文件变更和使用量统计

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面运行时 | Electron 33 |
| 前端 | React 18 + TypeScript 5.7 + Vite 6 |
| 状态管理 | Zustand 5 |
| UI 能力 | TailwindCSS 3 + Framer Motion + Allotment + Monaco + xterm.js |
| 本地数据 | better-sqlite3（SQLite） + electron-store |
| 终端/进程 | node-pty + Node.js child_process |
| Provider 接入 | Claude Agent SDK、CLI subprocess、JSON-RPC app server |
| 打包 | electron-builder |
| 测试 | Vitest + JSDOM + Testing Library |

## 支持的 Provider

ABF 通过 `BridgeManager` 管理不同 Provider 适配器。当前内置 Provider 与通信方式如下：

| Provider | 内置 ID | Adapter | 通信方式 | MCP 支持 | 典型用途 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `claude-code` | `claude-sdk` | in-process SDK | 原生支持 | 复杂任务、Supervisor 调度、多文件重构 |
| Codex CLI | `codex` | `codex-appserver` | subprocess JSON-RPC | 通过 Prompt 降级注入 | 写代码、修 bug、实现功能 |
| Gemini CLI | `gemini-cli` | `gemini-headless` | CLI subprocess | 通过 Prompt 降级注入 | 大文件分析、代码审查、总结 |
| OpenCode | `opencode` | `opencode-sdk` | CLI / SDK | 原生支持 | 代码生成与补全 |

说明：

- 内置 Provider 只是默认适配配置，不代表应用自带所有外部 CLI 的登录态和可执行文件
- `Claude Code`、`Codex CLI`、`Gemini CLI`、`OpenCode` 需要你本机对应命令可用，或在设置里显式填写可执行路径
- Provider 配置保存在本地 SQLite 的 `providers` 表中，可在应用内开启/禁用、调整命令、模型、参数和环境变量

## 系统要求

推荐环境：

- Windows 10 / 11
- Node.js `20` 或 `22`
- npm
- Git

可选但常见的额外依赖：

- `claude`
- `codex`
- `gemini`
- `opencode`

如果你不是从源码运行，而是直接使用安装包，仍然建议确保对应 Provider 的 CLI 已安装并完成认证，否则应用启动后可以打开界面，但相关 Provider 无法真正执行任务。

## 快速开始

### 方式一：直接使用安装包

1. 从 GitHub Releases 或预发布页面下载 Windows 安装包
2. 安装后启动应用
3. 在设置页检查 Provider 命令或可执行路径
4. 创建新会话，选择工作目录并开始使用

### 方式二：从源码运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build      # 构建 renderer + electron
npm run pack       # 打包 Windows NSIS 安装包
npm run pack:mac   # 本地打包 macOS（仓库已配置目标，但当前 CI 主要产出 Windows 包）
```

前端单测：

```bash
cd frontend
npm test
```

## 首次使用建议流程

1. 安装并登录你需要的 Provider CLI
2. 打开应用，在设置页检查 Provider 列表
3. 对每个 Provider 视情况配置：
   - `Command`
   - `Executable Path`
   - `Default Model`
   - `Reasoning Effort`
   - `Environment Overrides`
4. 创建会话时选择工作目录，并指定 Provider
5. 如果是代码仓库任务，建议启用 Git Worktree 隔离
6. 如果需要子 Agent、网页搜索或浏览器自动化，确认对应 MCP 已启用

## 应用内主要模块

前端主要由以下几个功能域组成：

- `conversation`：聊天界面、消息气泡、流式输出、工具调用展示
- `layout`：三栏布局、活动栏、历史面板、搜索面板、状态栏
- `sessions`：会话创建、会话列表、当前会话工作区
- `file-manager` / `files`：文件浏览、快速打开、Monaco 查看器、Diff
- `terminal`：集成终端
- `dashboard` / `usage`：使用量与统计视图
- `kanban`：任务看板
- `workflow`：多步骤工作流
- `mission`：任务编排与执行
- `teams`：团队模板与 Agent Team 模式
- `settings`：Provider、通知、代理、语言、Worktree、更新等设置

## MCP 与 Skill

### 内置 MCP

仓库自带 MCP 配置目录：

```text
mcps/
├── agent-control/
├── chrome-devtools/
└── web-search/
```

作用概览：

- `agent-control`：子 Agent 生命周期管理，是多 Agent 编排链路中的核心部分
- `web-search`：网页搜索
- `chrome-devtools`：浏览器自动化

MCP 加载优先级：

1. 项目本地 `mcps/`
2. Cursor 项目级 MCP
3. Cursor 全局 MCP

### Skill 系统

`skills/` 目录内包含大量内置 Skill 模板，应用会把这些内容打包为额外资源。Skill 体系主要用于：

- 统一可复用的 Prompt 模板
- 输入变量展开
- 兼容 Provider 控制
- slash command 或 system prompt 注入

## 架构概览

### 主链路

```text
React Renderer
  -> preload 暴露的 IPC bridge
    -> electron/ipc/handlers.ts
      -> services/*
        -> BridgeManager
          -> Provider Adapter
            -> Claude SDK / Codex / Gemini / OpenCode
```

### 子 Agent 链路

```text
Supervisor / 主会话
  -> agent-control MCP
    -> AgentApi
      -> ProcessService
        -> SessionService + BridgeManager
          -> 新建子会话并绑定 Provider
```

### 数据持久化

核心数据保存在本地 SQLite 中，包括但不限于：

- Provider 配置
- Session 与消息
- Settings
- Task / Workflow / Mission
- Team 定义与实例
- Skill
- MCP Server
- 文件变更记录

## 项目结构

```text
electron/
├── main.ts                     # Electron 主进程入口
├── preload.ts                 # 安全 IPC bridge
├── ipc/
│   └── handlers.ts            # IPC 路由注册
├── bridge/
│   ├── bridge.ts              # BridgeManager
│   ├── ProviderCapabilityRegistry.ts
│   ├── toolMapping.ts
│   └── adapters/
│       ├── claude.ts
│       ├── codex.ts
│       ├── gemini.ts
│       └── opencode.ts
├── parser/                    # 各 Provider 输出解析规则
└── services/                  # 会话、Provider、MCP、Git、通知、Agent 生命周期等服务

frontend/
├── src/
│   ├── components/
│   ├── stores/
│   ├── hooks/
│   ├── constants/
│   ├── styles/
│   └── test/
└── package.json

mcps/                          # MCP 配置
resources/
├── mcp-server/                # Agent MCP Server
└── prompts/                   # ABF 规则与 Prompt 模板

skills/                        # 内置 Skill 集合
release/                       # 打包产物输出目录
```

## 本地数据与文件位置

应用运行后，关键数据默认位于以下位置：

- 数据库：`~/.allbeingsfuture/allbeingsfuture.db`
- 启动日志：`~/.allbeingsfuture/startup.log`
- 仓库内 Worktree：`<repo>/.allbeingsfuture-worktrees/`
- 打包输出：`release/`

说明：

- 数据库启用 SQLite WAL 模式
- `better-sqlite3` 和 `node-pty` 属于 native 模块，打包时通过 `asarUnpack` 处理
- `mcps/`、`skills/`、`resources/` 会作为 `extraResources` 一起打包

## 开发说明

### 安装依赖

```bash
npm install
```

根目录安装后会自动执行 `frontend` 的依赖安装。

### 启动开发环境

```bash
npm run dev
```

该命令会并行启动：

- Electron 主进程编译并启动
- Vite 开发服务器

### 只构建指定部分

```bash
npm run build:renderer
npm run build:electron
```

### 测试

```bash
cd frontend
npm test
```

当前测试重点主要覆盖前端组件、Hook 和 Zustand store。Electron 主进程暂无完整自动化测试框架，相关改动更依赖构建验证与手动联调。

## Git Worktree 工作流

这个项目把 Git Worktree 视为多 Agent 并行开发的重要能力，而不是额外插件。应用和仓库规则都围绕这个能力设计。

典型流程：

1. 基于主仓库创建独立 Worktree
2. 在隔离目录中让不同 Agent 各自工作
3. 单独提交改动
4. 合并回主分支
5. 清理 Worktree

仓库默认忽略以下目录：

```text
.allbeingsfuture-worktrees/
.abf-worktrees/
release/
frontend/dist/
electron/dist/
```

## 构建与发布

### 本地打包

Windows：

```bash
npm run pack
```

默认输出：

```text
release/AllBeingsFuture Setup <version>.exe
```

### 预发布工作流

仓库内置 GitHub Actions 预发布流程：

- 工作流文件：`.github/workflows/pre-release.yml`
- 运行环境：`windows-latest`
- Node 版本：`20`
- 触发方式：任意分支 push 或手动触发
- 产物：Windows 安装包

版本策略：

- `package.json` 中维护稳定版本，例如 `1.5.0`
- CI 预发布标签自动生成类似 `betaV1.5.x`

## 常见问题

### 1. 应用能打开，但 Provider 无法工作

通常不是界面问题，而是 Provider 运行环境没准备好。优先检查：

- 对应 CLI 是否已安装
- 命令是否在 `PATH`
- 是否已完成登录/认证
- 设置页里的 `Command` 或 `Executable Path` 是否正确

### 2. 为什么 Windows 是当前主发布目标

仓库当前打包脚本同时包含 Windows 和 macOS 目标，但 CI 预发布流程实际产出的是 Windows NSIS 安装包，因此项目目前更偏向 Windows 优先。

### 3. 为什么安装包没有签名

如果没有配置代码签名证书，`electron-builder` 会跳过签名步骤。这不影响本地构建，但会影响发行体验和系统信任提示。

### 4. 数据存在哪里

默认在用户目录下的 `~/.allbeingsfuture/`，包括数据库和启动日志。

## 适合什么场景

- 让一个主 Agent 协调多个子 Agent 并行做任务
- 在单个桌面应用内切换不同 AI Provider
- 面向代码仓库的真实开发任务，而不是纯聊天
- 需要 Git Worktree 隔离、文件查看、终端和任务编排
- 想把 MCP、Skill 和 Provider 统一纳入本地桌面工作流

## 许可证

本项目采用 [BSD 3-Clause](LICENSE) 许可证。

