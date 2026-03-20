/**
 * ABF 规则注入器
 *
 * 为 Claude Code 会话注入全套 ABF 规则文件：
 * - abf-supervisor.md  — Supervisor 调度指引（动态，含可用 Provider 列表）
 * - abf-architecture.md — 项目架构规则
 * - abf-providers.md    — Provider 适配规则
 * - abf-testing.md      — 测试规则
 * - abf-git-workflow.md — Git 与代码推送流程
 *
 * 注入方式：写入 {workDir}/.claude/rules/abf-*.md
 * （Claude Code 官方规则发现路径，会话启动时自动加载）
 * 会话结束后自动清理，不影响用户自己的规则文件
 *
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { appLog } from './log.js'

/** 所有 ABF 注入的规则文件名（会话结束时统一清理） */
const ABF_RULES_FILES = [
  'abf-supervisor.md',
  'abf-architecture.md',
  'abf-providers.md',
  'abf-testing.md',
  'abf-git-workflow.md',
] as const

// ==================== Prompt 构建 ====================

/**
 * 构建 Supervisor 引导 Prompt
 * @param availableProviders - 可用的 AI Provider 名称列表
 */
export function buildSupervisorPrompt(availableProviders: string[]): string {
  const providerList = availableProviders.length > 0
    ? availableProviders.join(', ')
    : 'claude-code'

  return `# AllBeingsFuture 多 Agent 调度环境

你运行在 AllBeingsFuture (ABF) 多 Agent 编排平台中。
你是一个 AI 团队的 Supervisor（总指挥），可以创建子 Agent 来并行处理子任务。

## 语言要求

- **思考（thinking/reasoning）必须使用中文**
- 所有输出（回复、进度报告、错误说明）也请使用中文
- 代码注释可以用英文，但与用户的交互一律使用中文
- **子 Agent 也必须使用中文**：spawn_agent 时的 name 和 prompt 都用中文描述，子 Agent 的回复也应该是中文
- **不要使用内置 Agent/Task 工具**，一律用 spawn_agent（详见下方"禁止使用内置 Agent/Task 工具"章节）

## 调度工具

- **spawn_agent**(name, prompt, provider?) — 创建子 Agent 会话，返回 child_session_id 和初始响应
  - **provider** — 可选，指定子 Agent 使用的 Provider。可用 Provider：${providerList}
  - 根据任务特点选择合适的 provider，不要总是使用默认的
- **send_to_agent**(child_session_id, message) — 向运行中的子 Agent 发送追加指令并等待响应
- **wait_agent_idle**(child_session_id, timeout?) — 等待子 Agent 完成当前任务变为空闲
- **get_agent_output**(child_session_id, lines?) — 获取子 Agent 的输出内容（默认全部）
- **get_agent_status**(child_session_id) — 查看子 Agent 当前状态
- **list_agents**() — 列出当前所有子 Agent 及其状态
- **close_agent**(child_session_id) — 终止并关闭子 Agent 会话

## Agent 生命周期

### 标准流程（推荐）

1. \`spawn_agent(name, prompt)\` 创建子 Agent → 返回 child_session_id 和初始响应
2. 查看返回的响应，确认任务是否完成
3. 如需进一步交互：\`send_to_agent(child_session_id, message)\` 发送追加指令
4. 任务完成后：\`close_agent(child_session_id)\` 释放资源

### 异步模式（并行多个 Agent）

1. 批量 \`spawn_agent\` 创建多个子 Agent
2. 逐个 \`wait_agent_idle(child_session_id)\` 等待各 Agent 完成
3. \`get_agent_output(child_session_id)\` 查看各 Agent 的结果
4. 所有任务完成后逐个 \`close_agent\`

### 多轮交互模式

1. \`spawn_agent(name, prompt)\` 创建子 Agent
2. 查看响应，如果需要调整方向
3. \`send_to_agent(child_session_id, "新的指令")\` 追加指令
4. 重复步骤 2-3 直到满意
5. \`close_agent(child_session_id)\` 关闭

## 最佳实践

1. **给每个 Agent 清晰的 prompt**：包含完整上下文、目标、约束和验收标准。不要假设子 Agent 知道背景
2. **多个独立任务并行处理**：先批量 spawn，再逐个 wait_agent_idle，最大化并行度
3. **根据任务类型选择 Provider**：
   - 复杂架构设计、多文件重构 → claude-code（综合推理最强）
   - 写代码、修 bug、加功能 → codex（代码生成专长）
   - 大文件分析、代码审查 → gemini-cli（上下文窗口大）
   - 文档总结、知识梳理 → gemini-cli（擅长长文本理解）
4. **不要只听 Agent 自己汇报**：Agent 说"完成了"不等于真的完成了，你要验证：
   - 看实际 diff（git diff）
   - 确认能编译通过
   - 检查是否引入新问题
5. **发现问题用 send_to_agent 让同一 Agent 修**，不要另起一个
6. **用完一定要 close_agent**，释放资源

## 错误处理与超时

- \`wait_agent_idle\` 的 timeout 参数单位为毫秒，默认 300000（5分钟）
- 超时后返回 \`idle: false\`，此时可以：
  - 用 \`get_agent_output\` 查看当前进度
  - 用 \`get_agent_status\` 检查状态
  - 继续 \`wait_agent_idle\` 等待
  - 或 \`close_agent\` 放弃
- 推荐使用轮询模式避免长时间阻塞：\`wait_agent_idle(id, 90000)\` → \`get_agent_output\` → 检查状态 → 继续等待
- 保持 \`wait_agent_idle\` 的 timeout <= 90000ms，循环轮询直到完成

## 禁止使用内置 Agent/Task 工具（重要）

**绝对不要使用 Claude Code 内置的 \`Agent\` 或 \`Task\` 工具。** 原因：
- 内置 Agent 是轻量子任务，在 ABF 平台中活动记录不完整（右侧时间线只有输入和启动两个事件）
- 内置 Agent 不能使用 Worktree 隔离环境
- 内置 Agent 不受 ABF 规则约束（不会使用中文）
- 内置 Agent 的输出不能被 ABF 平台完整追踪和展示

**所有需要委派给子任务的工作，一律使用 \`spawn_agent\`。** spawn_agent 创建的是完整的 AI 会话（和主 Agent 完全一样的能力），拥有：
- 完整的活动记录和工具调用历史
- Worktree 支持（子 Agent 可以进入自己的隔离环境）
- 继承 ABF 全部规则（中文要求、Git 规范等）
- 多轮交互能力（send_to_agent 追加指令）
- 支持选择不同 AI Provider

**唯一不需要 spawn_agent 的情况：** 简单的只读操作（搜索文件、读取代码），直接用 Grep/Read/Glob 即可，无需启动完整 agent。

## Worktree 安全警告

- 如果工作目录在 git worktree 中（\`.git\` 是文件而非目录），说明当前已处于隔离分支
- 子 Agent 默认继承父会话的工作目录
- 多个 Agent 同时修改同一目录的文件可能产生冲突，建议给不同 Agent 分配不同的文件范围
- 不要让子 Agent 执行 \`git checkout\`、\`git reset --hard\` 等破坏性操作

## 进度报告要求（必做）

- 在长时间执行过程中，主动向用户报告进度
- 至少在每个主要阶段（分析 / 实现 / 验证）报告一次
- 如果遇到阻塞，明确报告阻塞原因和下一步行动，不要沉默
- 每次更新保持简洁（一两句话）

## 开发任务思维框架

当收到一个开发任务时，你是项目经理，不只是调度器。你要为最终交付质量负责。

**进入 Worktree → 理解 → 拆分 → 实现 → 验证 → 交付**

### 进入 Worktree（强制，第一步）
- **收到任何涉及代码修改的任务后，在修改任何文件之前，必须先调用 \`EnterWorktree\` 工具创建隔离环境**
- 这是 ABF 项目的强制规范，不需要用户显式提到"worktree"。只要任务涉及代码变更就必须进入
- 只有纯搜索/只读任务（如"这个函数做了什么"）不需要 worktree
- 如果已经在 worktree 中（\`.git\` 是文件而非目录），则跳过此步
- Worktree 名称建议使用任务简述，如 \`fix-folder-drag\`、\`feat-message-queue\`

### 理解
- 先搞清楚要改哪些模块、模块之间有没有依赖
- 不确定就先自己读代码，不要急着 spawn

### 拆分
- 没有依赖的任务并行，有依赖的串行
- 拆分粒度由你判断：一个文件的改动不值得 spawn，跨模块的才值得

### 实现
- 给每个 Agent 的 prompt 要包含：背景、目标、约束、验收标准
- 用 wait_agent_idle + get_agent_output 跟进，发现偏了用 send_to_agent 纠正
- 不要等 Agent 全做完再看，中途就要检查

### 验证（关键）
- Agent 说"完成了"不等于真的完成了。你要自己验证：
  - 看实际 diff：改动范围是否合理，有没有多余的改动
  - 跑构建：改了代码就该确认能编译通过
  - 跑相关测试：改了逻辑就该确认测试通过
  - 检查是否引入新问题：类型错误、遗漏的导入等
- 发现问题 → send_to_agent 让同一个 Agent 修
- 验证什么、怎么验证，由你根据改动内容判断

### 交付
- 给用户一个清晰的交付报告：改了什么、为什么这么改、验证了什么
`
}

// ==================== 静态规则内容 ====================

function buildArchitectureRules(): string {
  return `# AllBeingsFuture 项目架构规则

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

\`\`\`
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
\`\`\`

## 核心架构链路

### 多 Agent 编排

\`\`\`
Claude Code (Supervisor Agent)
  → agent-control MCP Server (mcps/agent-control/server.mjs, stdio)
    → HTTP → AgentApi (electron/services/agent-api.ts, localhost:随机端口)
      → ProcessService + BridgeManager
        → 创建 DB 会话 + 启动 Provider Adapter
\`\`\`

### IPC 通信

\`\`\`
Frontend (React)
  → window.electron.invoke(channel, args)    # preload 暴露
    → ipcMain.handle(channel, handler)        # electron/ipc/handlers.ts 路由
      → 调用 services 层处理
\`\`\`

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

- 改 \`electron/\` 下 TypeScript → 需要 \`npm run build:electron\` 重编译
- \`node-pty\` 和 \`better-sqlite3\` 是 native 模块，在 \`asarUnpack\` 中
- MCP servers 和 skills 作为 \`extraResources\` 打包，不进 asar
- \`.claude/rules/abf-*.md\` 是动态注入的，不要手动编辑（会被覆盖）
- 新增 IPC channel 需要在 \`handlers.ts\` 注册并在 \`preload.ts\` 暴露

### 状态管理

- Electron 主进程：服务类单例 + SQLite 持久化
- Frontend：Zustand store（30+ 个独立 store，按功能拆分）
- 跨进程通信：只通过 IPC，不共享内存
`
}

function buildProviderRules(): string {
  return `# AllBeingsFuture Provider 适配规则

## Provider 概览

ABF 通过 BridgeManager 统一管理多个 AI Provider 适配器，每个 Provider 有不同的通信方式和能力边界。

## Provider 列表与特性

| Provider | Adapter Key | 通信方式 | MCP 支持 | 适合场景 |
|----------|-------------|---------|---------|---------|
| Claude Code | \`claude-sdk\` | in-process (SDK 直接调用) | 原生支持 | 复杂架构设计、多文件重构、Supervisor 调度 |
| Codex CLI | \`codex-appserver\` | subprocess JSON-RPC | 不支持（prompt 注入降级） | 写代码、修 bug、加功能 |
| Gemini | \`gemini-headless\` | CLI subprocess | 不支持 | 大文件分析、代码审查、文档总结 |
| OpenCode | \`opencode-sdk\` | SDK/CLI | 原生支持 (OPENCODE_CONFIG env) | 代码生成和补全 |

## 别名映射 (bridge.ts)

用户输入的 Provider 名称会被规范化到实际的 Adapter Key：

\`\`\`
claude / claude-code / claude_cli  →  claude-sdk
codex / codex-cli                  →  codex-appserver
gemini / gemini-cli                →  gemini-headless
opencode / opencode-cli            →  opencode-sdk
\`\`\`

开发时注意：新增别名需要在 \`bridge.ts\` 的 \`normalizeProviderKey()\` 中添加映射。

## Provider 能力注册 (ProviderCapabilityRegistry.ts)

每个 Provider 在能力注册表中声明支持的功能：

\`\`\`typescript
{
  mcpSupport: 'native' | 'prompt-injection' | 'none',
  skillSupport: 'slash-command' | 'system-prompt' | 'none',
  systemPromptSupport: boolean,
}
\`\`\`

### MCP 支持等级

1. **native** — Provider 原生支持 MCP 协议，直接传入 MCP 配置
   - Claude Code SDK：通过 \`config.mcpServers\` 参数传入
   - OpenCode：通过 \`OPENCODE_CONFIG\` 环境变量配置
2. **prompt-injection** — Provider 不支持 MCP，ABF 将 MCP 工具描述注入到 system prompt 中
   - Codex CLI：通过 system prompt 注入工具描述
3. **none** — 不支持 MCP
   - Gemini CLI

开发时注意：新增 Provider 必须在 \`ProviderCapabilityRegistry.ts\` 注册能力，否则 MCP 注入和 Skill 分发会失败。

## 适配器开发规范

### 文件位置

所有适配器在 \`electron/bridge/adapters/\` 目录下，每个 Provider 一个文件。

### 适配器必须实现的接口

1. **启动会话** — 初始化 Provider 连接，传入 system prompt 和 MCP 配置
2. **发送消息** — 将用户消息转发给 Provider
3. **接收输出** — 将 Provider 输出转为统一事件格式（通过 OutputParser）
4. **关闭会话** — 清理资源

### 输出解析

- 每个 Provider 在 \`electron/parser/\` 下有对应的 \`*Rules.ts\` 解析规则
- \`OutputParser.ts\` 根据 Provider 类型选择对应规则
- 所有输出最终转为统一的 \`ActivityEventType\`（定义在 \`toolMapping.ts\`）

### 工具映射 (toolMapping.ts)

不同 Provider 的工具名称不同，但需要映射到统一的 ActivityEventType：

- Claude 的 \`Read\` / Codex 的 \`read_file\` → 统一为 \`file_read\` 事件
- Claude 的 \`Edit\` / Codex 的 \`apply_patch\` → 统一为 \`file_edit\` 事件

开发时注意：新增 Provider 的工具必须在 \`toolMapping.ts\` 中添加映射，否则 UI 无法正确显示工具执行状态。

## Supervisor 与子 Agent 的 Provider 选择

- Supervisor 始终是 Claude Code SDK（因为只有它原生支持 MCP，能调度其他 Agent）
- 子 Agent 可以是任意 Provider，由 Supervisor 在 \`spawn_agent\` 时通过 \`provider\` 参数指定
- \`supervisor-prompt.ts\` 会动态读取已配置的 Provider 列表，注入到 Supervisor 的规则中

## 额度不足降级策略

当某个 Provider 报额度不足错误时，建议按以下顺序切换：

\`\`\`
claude-code → gemini-cli → codex → opencode
\`\`\`

## 注意事项

- Claude SDK 是 in-process 运行，崩溃会影响主进程，需要做好错误隔离
- Codex CLI 是独立子进程，通过 JSON-RPC 通信，注意进程僵死和超时处理
- 所有 Provider 的 API Key / 认证信息通过 \`electron/services/provider.ts\` 管理，存储在 SQLite 的 \`providers\` 表中
- 不要在代码或日志中明文输出 API Key
`
}

function buildTestingRules(): string {
  return `# AllBeingsFuture 测试规则

## 测试框架

- **框架**: Vitest 3.0 + JSDOM
- **断言库**: @testing-library/jest-dom
- **渲染工具**: @testing-library/react
- **配置文件**: \`frontend/vitest.config.ts\`

## 目录结构

\`\`\`
frontend/src/
├── test/
│   ├── setup.ts           # DOM polyfills (matchMedia, ResizeObserver, scrollIntoView)
│   └── render.tsx         # 自定义 render wrapper（注入 providers）
├── components/
│   └── <module>/__tests__/
│       └── <component>.test.tsx
└── hooks/__tests__/
    └── <hook>.test.ts
\`\`\`

## 运行测试

\`\`\`bash
cd frontend
npm test              # 单次运行所有测试
npm run test:watch    # 监听模式
npx vitest run <path> # 运行指定文件
\`\`\`

## 测试编写规范

### 文件命名与位置

- 测试文件放在被测模块同级的 \`__tests__/\` 目录下
- 文件名格式：\`<component-name>.test.tsx\` 或 \`<hook-name>.test.ts\`
- 例如：\`components/conversation/__tests__/message-input.test.tsx\`

### 使用自定义 render

使用 \`frontend/src/test/render.tsx\` 提供的自定义 \`render\` 函数，它会自动注入必要的 providers：

\`\`\`typescript
import { render } from '../../test/render'
import { MyComponent } from '../MyComponent'

test('should render correctly', () => {
  const { getByText } = render(<MyComponent />)
  expect(getByText('hello')).toBeInTheDocument()
})
\`\`\`

### 测试重点

1. **组件渲染测试** — 确认组件正常渲染，无崩溃
2. **用户交互测试** — 使用 \`@testing-library/react\` 的 \`fireEvent\` / \`userEvent\` 模拟交互
3. **Store 集成测试** — 测试 Zustand store 状态变化对组件的影响
4. **Hook 测试** — 使用 \`renderHook\` 测试自定义 hooks

### Mock 策略

- **Electron IPC**: mock \`window.electron.invoke\` 和 \`window.electron.on\`
- **Zustand stores**: 可以直接 \`import\` store 并在测试中 \`setState\`
- **Monaco Editor**: 需要 mock，JSDOM 不支持完整 Monaco
- **xterm.js**: 需要 mock canvas 相关 API

### 需要注意的 DOM Polyfill

\`test/setup.ts\` 已注入以下 polyfill，测试中可直接使用：

- \`window.matchMedia\`
- \`ResizeObserver\`
- \`Element.scrollIntoView\`

如果测试中遇到 "xxx is not defined" 类的错误，先检查是否需要在 \`setup.ts\` 中添加 polyfill。

## 什么时候必须写测试

1. **新增 UI 组件** — 至少写渲染测试，确认不会 crash
2. **修改核心交互逻辑** — 消息发送、会话切换、文件操作等用户关键路径
3. **新增/修改自定义 Hook** — Hook 逻辑应有独立测试
4. **Bug 修复** — 为修复的 bug 补回归测试，防止再次出现

## 什么不需要测试

- 纯样式/布局组件（无逻辑）
- Electron 主进程代码（当前无 Electron 端测试框架，用手动验证）
- 第三方库的封装（只测自己的逻辑）

## 测试质量要求

- 测试应该测行为，不要测实现细节
- 避免 snapshot 测试（维护成本高、容易被无脑更新）
- 不要在测试中 hardcode 时间戳或随机值，使用 mock
- 每个 \`test()\` 只测一个行为，命名要清晰说明在测什么
`
}

function buildGitWorkflowRules(): string {
  return `# AllBeingsFuture Git 与代码推送流程

## 仓库信息

- **主分支**: \`main\`
- **远程仓库**: \`origin\` (GitHub) + \`gitee\` (Gitee 镜像)
- **工作流**: 基于 Git Worktree 的隔离开发

## 分支规范

### 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能开发 | \`feat/<模块>-<描述>\` | \`feat/parser-gemini-support\` |
| Bug 修复 | \`fix/<描述>\` | \`fix/session-idle-detection\` |
| 重构 | \`refactor/<描述>\` | \`refactor/bridge-adapter-interface\` |
| Worktree 自动分支 | \`worktree/<描述>\` | \`worktree/ui-components-migration\` |

### 分支管理原则

- \`main\` 分支保持可构建状态，不直接在 main 上开发
- 所有代码修改通过 worktree 分支或功能分支进行
- 合并到 main 使用 \`--no-ff\`（保留合并记录）
- 合并完成后清理 worktree 分支

## Commit 规范

### 格式

\`\`\`
<type>: <简短描述>

[可选的详细说明]
\`\`\`

### Type 列表

| Type | 说明 | 示例 |
|------|------|------|
| \`feat\` | 新功能 | \`feat: add Gemini CLI adapter\` |
| \`fix\` | Bug 修复 | \`fix: resolve session idle race condition\` |
| \`refactor\` | 重构（不改变行为） | \`refactor: extract OutputParser from bridge\` |
| \`chore\` | 杂项（构建、依赖、配置） | \`chore: update electron-builder to v25\` |
| \`docs\` | 文档 | \`docs: add provider integration guide\` |
| \`test\` | 测试 | \`test: add conversation view tests\` |
| \`style\` | 代码风格（不影响逻辑） | \`style: fix indentation in handlers.ts\` |

### Commit 注意事项

- 每个 commit 应该是一个逻辑完整的改动，不要把多个不相关的修改混在一起
- commit message 用英文，简短清晰
- 不要提交 \`.env\`、API Key、数据库文件 (\`.db\`)
- 不要提交 \`node_modules/\`、\`electron/dist/\`、\`frontend/dist/\`

## Worktree 工作流（ABF 强制流程）

ABF 平台使用 Git Worktree 实现代码隔离，避免多 Agent 并行修改冲突。
**所有涉及代码修改的任务都必须在 worktree 中进行，不允许直接在 main 分支上修改代码。**

### 标准流程

\`\`\`
1. 调用 EnterWorktree 工具进入隔离环境（必做，不需要用户显式要求）
   → 自动基于当前 HEAD 创建隔离分支

3. 在 worktree 中完成修改并提交
   git add <files>
   git commit -m "feat: ..."

4. 合并回 main
   cd <项目根目录>
   git merge <worktree-branch> --no-ff

5. 清理 worktree
   git worktree remove .claude/worktrees/<name> --force
   git branch -d <worktree-branch>
\`\`\`

### Worktree 注意事项

- Worktree 基于已提交的 HEAD 创建，未提交的改动不会带入
- 多个 Agent 不要修改同一文件，按文件范围分工
- 如果 worktree 代码与 main 不同步，在 worktree 中执行 \`git merge main\`
- 不要在 worktree 中执行 \`git checkout\`、\`git reset --hard\` 等破坏性操作

## 推送到远程仓库

### 推送到 GitHub (origin)

\`\`\`bash
git push origin main
\`\`\`

### 同步到 Gitee 镜像

\`\`\`bash
git push gitee main
\`\`\`

### 推送新分支

\`\`\`bash
git push -u origin <branch-name>
\`\`\`

### 推送注意事项

- 永远不要 force push main 分支
- 推送前确认本地 main 已合并所有 worktree 分支
- 推送前确认构建通过：\`npm run build\`
- 如果远程有新提交，先 \`git pull --rebase origin main\` 再推送

## .gitignore 关键规则

以下文件/目录不会被提交：

\`\`\`
# Worktree 隔离目录
.allbeingsfuture-worktrees/
.abf-worktrees/

# 构建产物
bin/
frontend/dist/
electron/dist/
release/
*.exe

# 数据库
*.db
*.db-journal
*.db-wal

# 环境变量
.env
.env.*

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
desktop.ini
\`\`\`

## 代码修改后的验证清单

在提交和推送前，确认：

1. **构建通过**
   \`\`\`bash
   npm run build
   \`\`\`

2. **前端测试通过**（如果改了 frontend）
   \`\`\`bash
   cd frontend && npm test
   \`\`\`

3. **没有引入敏感信息**
   \`\`\`bash
   git diff --cached    # 检查 staged 内容
   \`\`\`

4. **commit message 符合规范**

5. **确认推送目标分支正确**
`
}

// ==================== 规则内容构建（供 system prompt 注入） ====================

/**
 * 构建全套 ABF 规则内容（字符串拼接，供注入到 system prompt）
 *
 * @param availableProviders - 可用的 AI Provider 名称列表
 * @param includeSupervisor - 是否包含 Supervisor 调度指引（默认 true）
 * @returns 拼接后的规则文本
 */
export function buildAllRulesContent(
  availableProviders: string[],
  includeSupervisor = true,
): string {
  const parts: string[] = []
  if (includeSupervisor) {
    parts.push(buildSupervisorPrompt(availableProviders))
  }
  parts.push(buildArchitectureRules())
  parts.push(buildProviderRules())
  parts.push(buildTestingRules())
  parts.push(buildGitWorkflowRules())
  return parts.join('\n\n---\n\n')
}

// ==================== 文件操作 ====================

/**
 * 确保 .claude/rules/ 目录存在
 */
function ensureRulesDir(workDir: string): void {
  const rulesDir = path.join(workDir, '.claude', 'rules')
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true })
  }
}

/**
 * 注入全套 ABF 规则到工作目录
 * 写入 .claude/rules/abf-*.md，Claude Code 启动时自动加载
 *
 * @param workDir - 会话工作目录
 * @param availableProviders - 可用的 AI Provider 名称列表
 * @returns 写入的 supervisor 规则文件路径（兼容旧调用方）
 */
export function injectSupervisorPrompt(
  workDir: string,
  availableProviders: string[],
): string {
  ensureRulesDir(workDir)
  const rulesDir = path.join(workDir, '.claude', 'rules')

  // 构建所有规则文件内容
  const rulesMap: Record<string, string> = {
    'abf-supervisor.md': buildSupervisorPrompt(availableProviders),
    'abf-architecture.md': buildArchitectureRules(),
    'abf-providers.md': buildProviderRules(),
    'abf-testing.md': buildTestingRules(),
    'abf-git-workflow.md': buildGitWorkflowRules(),
  }

  // 批量写入
  for (const [filename, content] of Object.entries(rulesMap)) {
    const filePath = path.join(rulesDir, filename)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  appLog('info', `[Supervisor] Injected ${Object.keys(rulesMap).length} rule files to: ${rulesDir}`, 'supervisor-prompt')
  return path.join(rulesDir, 'abf-supervisor.md')
}

/**
 * 清理所有 ABF 规则文件（会话结束时调用）
 *
 * @param workDir - 会话工作目录
 */
export function cleanupSupervisorPrompt(workDir: string): void {
  const rulesDir = path.join(workDir, '.claude', 'rules')
  for (const filename of ABF_RULES_FILES) {
    try {
      const filePath = path.join(rulesDir, filename)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Ignore cleanup errors — file may already be gone
    }
  }
  appLog('info', `[Supervisor] Cleaned up rule files from: ${rulesDir}`, 'supervisor-prompt')
}
