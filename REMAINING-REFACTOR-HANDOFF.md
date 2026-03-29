# Command Bus Phase 1 Handoff

## 已完成

- 已建立 `frontend/src/app/command-bus`、`frontend/src/app/api/workbench.ts`、`frontend/src/app/runtime/installWorkbenchRuntime.ts`
- `chat / terminal / panel / layout / workflow / navigation / provider / file-manager / quick-open` 等高频入口已统一收口到 `workbenchApi + command bus + runtime`
- 已修复 `panel.hide()` 语义错误，隐藏动作不再错误触发反向显示
- Electron PTY 输出已改为 16ms 批量推送，前端 terminal 已支持 `active / inactive / frozen`
- `ProviderService.TestExecutable` 已在 Electron 主进程和 preload 桥中落地
- `sessionStore` 已拆为：
  - `frontend/src/core/chat/chatCore.ts`
  - `frontend/src/stores/sessionSnapshotStore.ts`
  - `frontend/src/stores/sessionStore.ts` 仅保留兼容导出
- `shellTerminalStore` 已拆为：
  - `frontend/src/core/terminal/terminalCore.ts`
  - `frontend/src/stores/shellTerminalSnapshotStore.ts`
  - `frontend/src/stores/shellTerminalStore.ts` 仅保留兼容导出
- `useShellTerminal.ts` 已不再直接访问 `window.allBeingsFuture?.pty`

## 已验证

- `frontend npm test` 通过
- `npm run build` 通过

## 剩余建议优先级

### P1

- 抽出 `WorkflowCore`
  - 当前 `frontend/src/stores/workflowStore.ts` 仍直接承载 CRUD、运行、历史加载等业务逻辑
  - 目标是拆成 `core/workflow/* + workflowSnapshotStore`
- 抽出 `FileManagerCore`
  - 当前 `frontend/src/stores/fileManagerStore.ts` 仍承载目录缓存、watch、session files、桥接调用等逻辑
  - 目标是拆成 `core/file-manager/* + fileManagerSnapshotStore`

### P2

- 继续收口 `team / mission / git` 模块
  - 这些模块仍主要是 store 驱动，不是统一的 headless core
- 清理 UI 中残余的 store action 直连
  - 重点检查 `teams`、`dashboard`、`kanban` 一带组件

### P3

- 补齐 `feedbackStore.ts`、`plannerStore.ts` 中标记为“待实现”的后端接口
- 继续把 MCP tools/resources 映射到 `App API -> Core`，减少直接 bridge 心智负担
- 视情况补 `EditorCore / PanelCore / LayoutCore`，让整体目录结构更贴近 GOAL.md

## 新会话建议起手

1. 先读本文件
2. 再读：
   - `frontend/src/app/api/workbench.ts`
   - `frontend/src/app/runtime/installWorkbenchRuntime.ts`
   - `frontend/src/core/chat/chatCore.ts`
   - `frontend/src/core/terminal/terminalCore.ts`
3. 第一刀优先做 `WorkflowCore`
