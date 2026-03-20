<div align="center">

# 🌌 AllBeingsFuture

**AI Workbench · Multi-Agent Orchestration · Electron + React**

[![Electron](https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Claude](https://img.shields.io/badge/Claude_Agent_SDK-0.2-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://www.anthropic.com/)

</div>

---

## 🚀 关于项目

**AllBeingsFuture** 是一个基于 Electron + React 构建的桌面端 AI 工作台，将多个顶级 AI 提供商整合到统一的工作流中，并实现了 **持久化多智能体编排架构**。

> 💡 核心理念：以 Claude 作为主智能体，统一调度 Codex、Gemini、OpenCode 等子智能体，协同完成复杂任务。

---

## ✨ 核心特性

### 🤖 多智能体编排
- **Claude** 作为主编排智能体（via `@anthropic-ai/claude-agent-sdk`）
- **持久化子智能体** — 子 Agent 不随任务结束而销毁，支持持续交互
- **MCP 协议集成** — 自研 `agent-control` MCP Server，提供 `spawn_agent` / `send_to_agent` / `list_agents` / `close_agent` 工具

### 🌐 多 AI 提供商
| 提供商 | 角色 |
|--------|------|
| 🟠 Claude Code SDK | 主编排智能体 |
| 🟢 OpenAI Codex CLI | 代码子智能体 |
| 🔵 Google Gemini | 通用子智能体 |
| ⚪ OpenCode | 开源代码智能体 |

### 🏗️ 技术架构
```
┌─────────────────────────────────────────────┐
│              Electron Main Process           │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │ ProcessService│  │  agent-api (HTTP)    │ │
│  │  (子进程管理) │◄─►│  MCP Bridge Layer   │ │
│  └──────────────┘  └──────────────────────┘ │
│           │                                  │
│  ┌────────▼─────────────────────────────┐   │
│  │         agent-control MCP Server     │   │
│  │  spawn · send · list · close agents  │   │
│  └──────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│           React Frontend (Vite)             │
│      Sessions · Chat · Multi-Agent UI       │
└─────────────────────────────────────────────┘
```

### 💾 数据层
- **SQLite** (`better-sqlite3`) — 本地持久化会话与历史记录
- **electron-store** — 用户配置持久化

---

## 🛠️ 技术栈

<div align="center">

![Electron](https://img.shields.io/badge/-Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?style=flat-square&logo=node.js&logoColor=white)

</div>

---

## 📦 快速开始

```bash
# 克隆仓库
git clone https://github.com/AllBeingsFuture/AllBeingsFuture.git
cd AllBeingsFuture

# 安装依赖
npm install

# 开发模式启动
npm run dev

# 打包 Windows 安装包
npm run pack
```

---

## 🔮 路线图

- [x] Electron + React 基础框架
- [x] Claude Agent SDK 集成
- [x] MCP agent-control 持久化智能体架构
- [x] 多 AI 提供商接入（Codex / Gemini / OpenCode）
- [ ] 智能体协作可视化面板
- [ ] 跨平台支持（macOS / Linux）
- [ ] 插件市场

---

<div align="center">

**构建中 · Building the Future with AI Agents** 🌏

</div>
