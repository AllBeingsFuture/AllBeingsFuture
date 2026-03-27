# AllBeingsFuture

多 Agent AI 工作台，支持多 AI Provider 编排调度。基于 Electron + React 构建的桌面应用。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 桌面 | Electron 33 (Main + Renderer 双进程) |
| 前端 | React 18 + TypeScript 5.7 + Vite 6 + Zustand 5 + TailwindCSS 3 |
| 后端 | better-sqlite3 (SQLite)、node-pty (伪终端)、Claude Agent SDK |
| 构建 | electron-builder → Windows NSIS 安装包 |

## ✨ 核心功能

- **多 Provider 支持** — Claude Code、Codex CLI、Gemini CLI、OpenCode，统一调度
- **多 Agent 编排** — Supervisor 模式，支持并行创建子 Agent 处理复杂任务
- **MCP 协议** — 内置 Agent Control、Web Search、Chrome DevTools 等 MCP Server
- **69+ 内置 Skill** — 代码审查、文档生成、PPT/PDF/Excel 处理、图片理解、翻译等
- **Git Worktree 隔离** — 多 Agent 并行开发时自动隔离代码环境
- **内置终端** — 基于 xterm.js + node-pty 的集成终端
- **Token 用量仪表盘** — 实时追踪 AI 使用量

## 🚀 入门指南

**前提条件**：[Node.js 22+](https://nodejs.org/)（需安装 npm）

```bash
npm install           # 安装依赖（自动触发 frontend postinstall）
npm run dev           # 开发模式（hot reload）
npm run build         # 生产构建
npm run pack          # 打包 Windows 安装包
```

## 📁 项目结构

```
electron/                   # Electron 主进程
├── main.ts                 # 入口：窗口、IPC、SQLite、系统托盘
├── preload.ts              # Context Isolation 桥接
├── bridge/                 # Provider 适配层
│   └── adapters/           # Claude / Codex / Gemini / OpenCode 适配器
├── parser/                 # CLI 输出解析引擎
├── services/               # 42 个服务模块 (~9000+ LOC)
└── ipc/handlers.ts         # 50+ IPC channel 路由

frontend/src/               # React 渲染进程
├── stores/                 # 30+ Zustand store
├── components/             # UI 组件
└── hooks/                  # 自定义 Hooks

mcps/                       # MCP Servers
├── agent-control/          # 子 Agent 生命周期管理
├── web-search/             # 网页搜索
└── chrome-devtools/        # 浏览器自动化

skills/                     # 69+ 内置 Skill 模板
```

## 🤝 贡献

我们欢迎各种形式的贡献！请查看问题列表或提交拉取请求。

---

## 📜 许可证

本项目采用 [BSD 3-Clause](LICENSE) 许可证开源。

## 🔗 链接

- [LINUX DO](https://linux.do/)
