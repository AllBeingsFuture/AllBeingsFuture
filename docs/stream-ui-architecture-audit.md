# 会话流式 UI 架构审计与换结构方案

> 日期：2026-08-05  
> 范围：只读审计 + 方案（本提交不含功能代码改动）  
> 痛点：LIVE 工具条在消息中间；子 Agent/后台不实时刷新；打开子会话非最新且不贴底

---

## A. 提交数量结论

口径：`--all` + subject 关键词（stick/scroll/stream/live tool/silence/settle/transcript/child reload 等）+ 路径  
`frontend/src/components/conversation/`、`frontend/src/core/chat/`，去掉纯 merge/docs/编排噪声。

| 指标 | 数字 |
|------|------|
| **直接相关去重 hash** | **42** |
| **同 patch-id 去重后逻辑补丁** | **~37** |
| **近 2 周**（since 2026-07-22） | **35** |
| **近 30 天**（since 2026-07-06） | **35**（与 2 周同：高峰集中在 7 月末–8 月初） |
| `fix(chat)` subject 全量（含交叉） | **30** |

### 主题分组（主主题互斥粗分）

| 主题 | 主主题约数 | 交叉（可多标签） |
|------|------------|------------------|
| ① stick / scroll / virtual | ~21 | ~22–25 |
| ② stream / live tool | ~11 | ~27–33 |
| ③ child session switch / transcript reload | ~4 | ~4–8 |
| ④ silence fail-open / settle remount | ~6 | ~6–11 |

放宽 subject（所有 fix(chat)/path 邻接）约 **55** hash；报告以 **42 直接相关** 为准。

### 重复 cherry-pick（存在）

同一 patch-id 双胞胎（`git show \| git patch-id --stable` 一致），易造成「修了很多次其实同一批」：

| 逻辑修复 | hash A | hash B |
|----------|--------|--------|
| only stick-to-bottom when near live tail | `963d1f2` | `e511780` |
| false-bottom reattach + virtual keys | `b70c51e` | `2fc2d70` |
| silence fail-open steal stream | `680221a` | `8f362cc` |
| clear live tool markers | `bf1de07` | `74df920` |
| ACP streaming UX（较早） | `a851e2e` | `91263ef` |

### 最关键 oneline（新→旧，含双胞胎标注）

```
e7d955f fix(chat): force-reload transcript when selecting child agents
fd51c7f fix(chat): re-pin stick-to-bottom after stream settle height jumps
963d1f2 fix(chat): only stick-to-bottom when near live tail (stream + settled)  ≡ e511780
b70c51e fix(chat): block false-bottom reattach and stabilize virtual keys       ≡ 2fc2d70
680221a fix(chat): stop silence fail-open from stealing stream content          ≡ 8f362cc
bf1de07 fix(chat): clear live tool markers on stream terminal events            ≡ 74df920
b811267 fix(chat): live tool partial flags and stop stream settle remount jumps
4df2b6c perf(chat): smooth live stream UI with tool batch + cheaper renders
7974643 fix(chat): converge toolStatus on agent:stream and isolate parent UI
7d39dd0 fix(chat): bottom-align short streams and drop composer bottom spacer
2660bcf fix(chat): keep grok stream UI live after silence fail-open
bb87272 fix(chat): stop virtual list blank gap under last assistant message
2129b4d fix(conversation): re-pin stick-to-bottom on streaming content growth
bd98d02 fix(conversation): show live tool/thinking progress during stream
8efd284 fix(chat): stream batch max-wait, child tool update mirror, view deps
9ed7265 fix(frontend): fail-open when agent stream stalls or backend ends
90f73e1 fix(conversation): re-attach stick-to-bottom on user send
508b511 fix(frontend): globalize stream IPC and harden session stream store
0fc9351 fix(chat): smooth streaming with rAF batch and scroll measure
f0f040d fix(chat): stop virtual list blank gaps from collapsed thinking
30f4389 fix(chat): keep parent messages when switching to child agents
3179eab fix(conversation): stabilize history scroll while streaming
2cbbb6c fix(chat): allow scrolling up long conversation history
```

---

## B. 结构性根因（贴片 fix 修不掉）

### 现状组件树

```
ConversationView
├─ SessionToolbar
├─ scrollContainer（overflow-y + 可选 virtualizer）
│  └─ content
│     ├─ messageGroups  ← 历史 + LIVE 工具/思考 混在同一 list
│     │  ├─ message / thinking / tool_group(LIVE) / child_agent(摘要)
│     ├─ AgentActivityPanel（plan/权限，仍在 scroll 内）
│     └─ StreamingIndicator
└─ MessageInput（composer，无 Live Dock）
```

### 数据流

```
IPC agent:stream → installWorkbenchRuntime
  → sessionStore.handleAgentStreamEvent / agentStreamBatch
  → agentStreamCore.reduce → agentStreamMessages[sessionId]
  → 仅 selectedId===sessionId 时同步到 messages
ConversationView 只读当前 selected 的 messages + agentStreams[id]
```

### 根因 1 — LIVE 工具与 transcript 同一 list，无 bottom dock

- **机制**：`groupMessages` 把 in-flight `tool_use` 编成 chronological `tool_group`，`ToolOperationGroup` 渲染 LIVE；多轮后工具行落在「上文气泡」与「下文气泡」之间。
- **路径**：`ConversationView.tsx`（`groupMessages` / `renderMessageGroup`）、`ToolOperationGroup.tsx`、`agentStreamCore.ts`（`upsertToolCall` 顺序）。
- **为何贴片无效**：产品期望是「composer 上方固定 live 区」；当前模型是「工具是消息序列的一部分」。sticky CSS / 估高 / re-pin 仍绑在虚拟行上。

### 根因 2 — 贴底 =「已在尾部且未脱离」，不是「有流就跟」

- **机制**：`shouldStickToBottom()` 要求未 detach、无上滑意图、且 `isNearBottom`；读历史时 tail 增长故意不 pin。
- **路径**：`useConversationScroll.ts`（`shouldStickToBottom` / `userDetachedRef` / `liveTailRevision` layout effect）。
- **为何贴片无效**：「跟 LIVE」与「读历史不抢走」在同一滚动容器上硬冲突；调 threshold 只能在两极之间摇摆。

### 根因 3 — 虚拟列表把 tool 当普通行：高度随 partial/settle 抖动

- **机制**：`estimateMessageGroupHeight`（partial 偏高 / settled 折叠 ~88）+ `shouldPreferGrowingEstimate`；settle 折叠、RO 重测、spacer 与 stick 同轴。
- **路径**：`ConversationView.tsx`（estimate / `toolGroupHasOpenOperations`）、`useVirtualizedList.ts`、`getGroupKey`。
- **为何贴片无效**：估高补偿服务长会话虚拟化；LIVE 需要固定可视锚点——目标相反。

### 根因 4 — 流 settle 阶段机打断连续跟流

- **机制**：`streaming false` → multi-frame re-pin；`LIVE_RENDER_HOLD_MS` 后切 `useDeferredValue`；tool partial/`toolStatus` 清零触发折叠；plain→markdown remount 风险。
- **路径**：`ConversationView.tsx`（`preferLiveMessages` / `shouldRenderLiveMessages`）、`useConversationScroll` settle edge、`agentStreamCore.finalizeMessages`。
- **为何贴片无效**：这是 live 数组 → settled 快照的阶段切换，不是单行 remount bug。

### 根因 5 — 子会话：mirror + 乐观首帧 + 一次性 pin

- **机制**：共享 Zustand（非父子隔离库）；视图只挂 `messages`；后台写 `agentStreamMessages`。`select` 先乐观 buffer 再 `pollChat(force)`；`useConversationScroll` 切换只 pin 一次，无打开专用 `stickToBottomNow`；CV boot 非 force poll 可短路。
- **路径**：`sessionSnapshotStore.ts`（`select` / `pollChat` force）、`SessionPanel` remount（`key=session.id`）、`useConversationScroll` session reset、`ChildAgentBlock` 默认折叠摘要。
- **为何贴片无效**：force-reload（`e7d955f`）修了 stale cache 一类，但不改「先旧后新 + 高度未稳就 pin 完 + 父列表只有摘要」的结构。

---

## C. 推荐新结构：Bottom Live Dock

### 原则

1. **HistoryList**（已提交 turns）只读、可虚拟化、默认不与 LIVE 抢 stick。  
2. **StreamingViewport / LiveDock**（composer 上方固定层）专责 thinking / tools / text delta。  
3. **Settle 一次 fold**：turn 结束把 dock 内容原子写入 history，清空 dock。  
4. **贴底几乎只发生在 dock 内**（dock 自滚或始终展示最新 tool 行）；History 仅在「用户发送 / 打开会话定位最新」时 pin 一次。

### 组件树（目标）

```
ConversationShell
├─ HistoryScrollRegion          ← 只渲染 committed turns
│  └─ VirtualizedCommittedList    (message / settled tool_group / child summary)
├─ LiveDock (fixed above composer, not in virtual list)
│  ├─ LiveThinking
│  ├─ LiveToolStrip             ← 用户截图期望的 LIVE 区
│  └─ LiveAssistantDelta
└─ Composer (MessageInput)
```

### 数据流（目标）

```
agent:stream → store
  ├─ committedMessages[sessionId]     // 只在 turn settle / reload 写入
  └─ liveBuffer[sessionId]            // 当前 turn 的 thinking/tools/text
UI:
  History ← committedMessages[selected]
  Dock    ← liveBuffer[selected]（始终挂载，不依赖是否在历史尾部）
```

可选备选：**Cursor/Codex 风格 single stream buffer** — list 只渲染 committed turns；dock 直接绑 `liveBuffer`；无 `preferLiveMessages` 双源切换。与 Bottom Live Dock 同族，实现上更干净。

### 贴底规则如何变简单

| 场景 | 旧 | 新 |
|------|----|----|
| token / tool 增长 | History RO + liveTailRevision + virtual spacer | **仅 Dock 内更新**（无 history scroll 参与） |
| 用户读历史 | 复杂 detach/reattach 门闩 | History 独立滚动；Dock 仍显示 live（可折叠为「有新输出」条） |
| 用户发送 | `stickToBottomNow` 整表 | History pin 底 + Dock 清空并开始新 turn |
| settle | multi-frame re-pin + hold + deferred | **一次** append committed + 清空 Dock（History 可选微 pin） |

可大幅删除/冻结：`liveTailRevision` 驱动的整表 re-pin、`shouldPreferGrowingEstimate` 对 live tool 的特殊路径、false-bottom reattach 与 virtual key 抖动的耦合修法。

### 子 Agent「打开即最新」

1. `openSession(id)` → 等 `pollChat(id,{force:true})` settle（或确认 active `liveBuffer` 权威）后再标 ready。  
2. 首屏：History 渲染 committed；若 `liveBuffer` 非空同时亮 Dock。  
3. 打开专用 pin：force 完成后 **多帧 `stickHistoryToEnd()`**（等同今日 `stickToBottomNow`，但仅 History，且在 virtual totalHeight 可用后）。  
4. 父会话 `ChildAgentBlock`：保留摘要；「实时」进子会话看 Dock，不在父 list 展开完整 tool 流。  
5. `agentStreams.phase` 与后端 `streaming:false` 在 open 路径 converge，避免卡 prefer-stream。

### 迁移步骤（可分 PR）

| PR | 内容 | 风险 |
|----|------|------|
| **PR1** | 引入 `liveBuffer` store 字段 + LiveDock 壳（先 **镜像** 当前 last open tools，双写） | 低：不删旧路径 |
| **PR2** | in-flight tools/thinking/text 只进 Dock；History `groupMessages` 过滤 partial/open ops | 中：验收 LIVE 位置 |
| **PR3** | settle fold：terminal/done 时一次写入 committed，清空 Dock；删 `preferLiveMessages` hold | 中 |
| **PR4** | 简化 `useConversationScroll`：去掉 stream 期整表 stick 复杂门闩；History 仅 open/send pin | 中高：回归读历史 |
| **PR5** | 子会话 open：force-ready 门闩 + 打开专用 pin；收敛双 poll | 中 |
| **PR6** | 删除冻结代码与过时测试；补 Dock/open 验收测试 | 低 |

### 明确删除/冻结的旧区域（实现期）

**冻结（禁止再叠 fix(chat) 贴片）**

- `useConversationScroll.ts`：stream 期 `liveTailRevision` 全表 re-pin 策略（PR4 前冻结新逻辑）
- `ConversationView` 内「为 stick 服务」的 tool estimate 特判
- silence fail-open 与 UI remount 的交叉补丁（数据层可留，UI 不靠 remount 救命）

**目标删除（PR4–6）**

- `preferLiveMessages` / `LIVE_RENDER_HOLD_MS` 双源渲染
- History 内 `groupIsLive` 驱动 ToolOperationGroup 展开（改由 Dock）
- 为 live tool 服务的 `shouldPreferGrowingEstimate` 分支
- false-bottom / virtual key 与 stick 缠在一起的注释债代码路径（保留纯 history 虚拟化）

**保留**

- 全局 IPC `installWorkbenchRuntime` + per-session `agentStreamMessages` 镜像
- `pollChat(force)` 打开 rehydrate
- settled `ToolOperationGroup` 折叠展示（History 内）

### 成功标准（对应 3 痛点）

1. **LIVE 位置**：任意多轮「文→工具→文→工具」时，进行中的 LIVE 工具条 **仅** 出现在 composer 上方 Dock；History 中无 `isActive` LIVE 条。  
2. **实时刷新**：子 Agent 在侧栏 running 时，打开该子会话 Dock 在 **500ms 内** 显示最新 tool/text delta（不依赖用户滚动）；父会话摘要可滞后，但进子会话不得「冻住」。  
3. **打开即最新**：从父点「查看详情」进入已产出内容的子会话，首屏 **停在最新记录**（History 底 + 若仍 live 则 Dock 可见），无需手动滚。

---

## D. 是否现在开实现 PR

**建议：先评审本方案，再开 PR1（Dock 双写）**。  
改动面跨 `ConversationView` / scroll / virtual / store / 测试，不宜再叠单点 fix(chat)。  
本 worktree **只交付审计+方案文档**，不改运行时代码。

### 文件地图（实现时优先）

| 区域 | 路径 |
|------|------|
| 视图壳 | `frontend/src/components/conversation/ConversationView.tsx` |
| 贴底 | `frontend/src/components/conversation/useConversationScroll.ts` |
| 虚拟列表 | `frontend/src/components/conversation/useVirtualizedList.ts` |
| 工具 UI | `frontend/src/components/conversation/ToolOperationGroup.tsx` |
| Stream reduce | `frontend/src/core/chat/agentStreamCore.ts` / `agentStreamBatch.ts` |
| Store | `frontend/src/stores/sessionSnapshotStore.ts` |
| IPC | `frontend/src/app/runtime/installWorkbenchRuntime.ts` |
| 打开会话 | `frontend/src/app/api/workbench.ts` → navigation → `select` |
| 测试锚点 | `useConversationScroll.test.ts`、`sessionStore.test.ts`、`conversation-view.test.tsx` |
