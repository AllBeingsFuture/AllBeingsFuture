# Stream UI 替代结构：Turn-Commit Split Surface（主推）

> 状态：设计 only（本 worktree 不改运行时代码）  
> 日期：2026-08-05  
> 目的：用**结构切开**替代「继续叠 stick-to-bottom / virtualizer re-pin 贴片」  
> 对标痛点：LIVE 工具中插、不自动流式刷新、开子会话不在最新、历史 fix 过载

---

## 0. 现状诊断（真实路径，禁止再空想）

### 0.1 今日组件树

```
installWorkbenchRuntime.ts          # 全局 IPC（agent:stream / chat:* / agent:update）
  └─ sessionSnapshotStore.ts
       agentStreams[sessionId]      # phase / sequence / plan / permission
       agentStreamMessages[id]      # 按 session 的 live 消息缓冲
       messages / streaming         # 仅 selected 的 UI 投影
  └─ ConversationView.tsx
       groupMessages(messages)      # 历史 + live 混装成 groups
       useVirtualizedList           # 同一列虚拟滚动
       useConversationScroll        # stick 状态机 + liveTailRevision re-pin
       ToolOperationGroup / ToolUseCard   # LIVE 角标（中插 group）
       AgentActivityPanel           # plan/permission（列表之后，仍在 scroll 内容里）
       MessageInput                 # composer
```

### 0.2 根因（不是「再调阈值」能解决）

| 用户痛点 | 根因（代码事实） |
|----------|------------------|
| LIVE 工具出现在消息中间 | `groupMessages`（`ConversationView.tsx` ~85–204）按时间序切 `tool_group`；in-flight tool 与 settled 气泡同一 scroll 列。`AgentActivityPanel` **不**承载工具卡。 |
| 不自动实时流式刷新 | 贴底仅当 `shouldStickToBottom()`（near-bottom ∧ !detached ∧ intent≠up）。token 靠 `liveTailRevision` 在**同一 scroll range** 内 re-pin；上滑后永远不跟；高度 estimate/measure 抖动会假 detach / 假 near-bottom。 |
| 开子会话不是最新 | `select` 会 optimistic paint + `pollChat(force)`，且 scroll hook 会 pin 底 3s；但 **follow 不是 session 级持久模型**，长历史 + virtualizer + mid-list live 高度仍可落到「看起来不在最新」。 |
| 贴片债 | `useConversationScroll` / `useVirtualizedList` / `liveTailRevision` / growing estimate / LIVE hold 700ms — 全部在「混装列表」上互相补偿。 |

### 0.3 已有可复用锚点（不要重造管道）

- 单订阅雏形：`agentStreams` + `agentStreamMessages` 已 per-`sessionId`
- 父/子 **共用** reduce 管线；FE **无** parent mirror 特判（子 stream 不写父 `messages`）
- BE legacy 才在父消息打 `childSessionId` → UI `child_agent` 块
- settle 边界已有：`finalizeMessages` + `phase` terminal + legacy `streaming:false`
- IPC 契约：`frontend/docs/acp-renderer-streaming.md`

**缺口**：没有 `committed` vs `live` 类型分离；没有 `scrollMode` 会话视口模型；LIVE 工具没有底部独立 surface。

---

## 1. 主推方案：Turn-Commit Split Surface

一句话：**列表只渲染已 settle 的 turn；进行中的 stream 永远在输入框上方的 LiveStage；每个 sessionId 维护 viewport.follow。**

比「Bottom Live Dock」更硬的一点：**先在 reduce 层切开缓冲，再做 UI 两区**——Dock 若仍把 tool 行写进同一 `messages[]` 再抽 DOM，会继续被 `groupMessages` 中插。

### 1.1 目标组件树

```
SessionConversationShell                    # 替换 ConversationView 壳职责
├── TranscriptViewport                      # 独立 scroll 容器（仅 committed）
│   ├── VirtualTranscriptList               # useVirtualizedList 简化版
│   │   └── settled groups only
│   │       MessageBubble / ToolOperationGroup(settled) / ChildAgentBlock / Thinking(settled)
│   └── JumpToLatestChip                    # scrollMode=free 时显示
├── LiveStage                               # 固定在 composer 上方，OUTSIDE transcript scroll
│   ├── LiveThinking
│   ├── LiveToolsRail                       # 进行中 tool 永远在这里（含 LIVE 角标）
│   ├── LiveAssistantText                   # partial text_delta
│   ├── LiveMeta                            # 现 AgentActivityPanel（plan/permission/status）
│   └── StreamingIndicator
└── ComposerShell
    └── MessageInput
```

### 1.2 数据流（单订阅总线）

```
agent:stream
  → parseAgentStreamEvent (agentStreamIpc.ts)
  → agentStreamBatcher (agentStreamBatch.ts)
  → sessionStreamStore.applyBatch(sessionId, events)   # 从 sessionSnapshotStore 抽出
       reduceTurn(sessionId, event):
         if text/thinking/tool/plan/permission while open:
           → write liveBuffer only（不 append 进 committed）
         if tool/tool_result 达到 terminal 且策略=「工具即时 commit」可选:
           → append settled tool rows to committed
         if done/error/cancelled:
           → finalize liveBuffer → append committed once
           → clear liveBuffer
  → selectedId 投影：UI 订 sessionStreamStore[selectedId]
       { committed, live, streamMeta, viewport }

父/子：同一 store key = sessionId；禁止 parent mirror 特判。
父 transcript 上的 child_agent 块仍来自 BE 标注的 settled 行，不承载子 live。
```

### 1.3 数据模型（新增概念，落在真实文件）

**新文件（建议）**

| 路径 | 职责 |
|------|------|
| `frontend/src/stores/sessionStreamStore.ts` | 从 `sessionSnapshotStore` 抽出 `agentStreams` + `agentStreamMessages` + batcher + handlers |
| `frontend/src/core/chat/turnCommit.ts` | `reduceLive` / `commitTurn` / `committedFromLive` pure 函数 |
| `frontend/src/types/sessionStreamTypes.ts` | `SessionStreamEntry` 类型 |
| `frontend/src/components/conversation/LiveStage.tsx` | 底部 live surface |
| `frontend/src/components/conversation/TranscriptViewport.tsx` | 仅 committed 列表 + 简化 scroll |
| `frontend/src/components/conversation/useSessionViewport.ts` | `{ scrollMode, pinOnSelect }` 每 session |
| `frontend/docs/stream-ui-architecture.md` | 本结构的正式契约（实现 PR 时从本 alt 文档落地） |

**`SessionStreamEntry` 草案**

```ts
type ScrollMode = 'follow' | 'free'

interface LiveBuffer {
  thinking?: { itemId: string; text: string }
  assistantText?: { itemId: string; text: string }
  tools: Array<{
    toolCallId: string
    name?: string
    title: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    input?: object
    resultText?: string
    outputs?: Array<{ stream: 'stdout' | 'stderr'; text: string }>
  }>
  // 可选：若选「工具完成即 commit」，completed 工具从 tools[] 移出进 committed
}

interface SessionStreamEntry {
  stream: AgentSessionStreamState          // 现有 phase/sequence/plan/permission
  committed: ChatMessage[]                 // 仅 settled（无 partial/isDelta 开工具）
  live: LiveBuffer | null                  // phase active 时非 null
  viewport: {
    scrollMode: ScrollMode                 // follow | free
    // free 时可选记住 scrollTop；follow 时 Transcript 只 pin 一次底，不跟 token
  }
}
```

**兼容桥（迁移期）**

- `sessionSnapshotStore.messages` = `committed + materialize(live)`（只给旧 UI / 测试）
- 新 UI 禁止再读混装 `messages` 做滚动决策

### 1.4 贴底为何变简单（规则 ≤3 条）

1. **Live 不进 Transcript 的 scrollHeight**  
   token / tool stdout 只改 `LiveStage` 固定区高度；`useConversationScroll` 的 `liveTailRevision` re-pin 整条链删除。

2. **`scrollMode` 只服务 Transcript**  
   - `follow`：Transcript 始终显示最后一条 **committed**（含 select / 用户发送 / JumpToLatest）  
   - `free`：用户上滑 Transcript → 只停 history；LiveStage **继续刷新**  
   - 用户点 JumpToLatest 或发送 → `follow`

3. **session 切换默认 `follow=true` 并 pin 一次**  
   不靠 3s force 窗口与 RO 对赌；切换瞬间 `viewport.scrollMode='follow'`。

（对比今日：`shouldStickToBottom` + detach 滞回 + RO 双观察 + multi-frame follow-up + growing estimate — 全部为混装列服务。）

### 1.5 子会话「打开即最新」保证

| 步骤 | 行为 | 锚点 |
|------|------|------|
| 1 | `select(childId)` → `viewport.scrollMode='follow'` | 新 `useSessionViewport` / entry.viewport |
| 2 | 乐观 paint `committed` 来自 buffer；若 `phase` active 同时挂 `live` | 现 `agentStreamMessages` 语义升级 |
| 3 | `pollChat(id,{force:true})`：active 保 live；settled 用 GetChatState 覆盖 committed | 现 `sessionSnapshotStore.select/pollChat` |
| 4 | Transcript pin 底 **一次**；LiveStage 有内容则已在视口底部固定区可见 | 结构保证，不依赖 stick 状态机 |
| 5 | 后台子通知：只写 `sessionStreamStore[childId]`；父 UI 不订则不重渲染；打开子时直接最新 | 单订阅总线 |

### 1.6 LIVE 工具永远在底部的保证

- reduce 时 `tool_call` / 进行中 `tool_update` **只写 `live.tools`**
- `LiveToolsRail` 固定在 LiveStage（composer 上方）
- `done` 时 `commitTurn`：把 tools + assistant text + thinking 按最终顺序 **一次 append** 进 `committed`，再 `groupMessages` 历史化
- **禁止** 在流中把 `partial` tool 行塞进 committed（今日 `updateTool` 直接写 messages 数组是根因）

可选策略（实现时二选一，默认 A）：

- **A. Turn-end commit**（Cursor/Claude 风格）：整 turn 结束后一次 append —— 结构最干净  
- **B. Tool-complete early commit**：单个 tool 完成后移入 committed，Live 只留 open tools —— 长工具 turn 历史更早可见，但 Transcript 高度仍会跳，需保留极简 pin

**主推默认 A**，B 仅作备选开关。

---

## 2. 备选方案：Bottom Live Dock（同壳不同刀口）

若不愿动 reduce 语义，可先做 **纯布局 Dock**：

- 仍用 `agentStreamMessages` 混装数组  
- `groupMessages` 后把 `groupIsLive` 的 groups **从列表拆出**，渲染进底部 Dock  
- Transcript 只渲染非 live groups  

| | Turn-Commit Split（主推） | Bottom Live Dock（备选） |
|--|--------------------------|---------------------------|
| 切开点 | reduce / store | 渲染过滤 |
| LIVE 中插 | 数据层禁止 | DOM 层规避，数据仍混 |
| 迁移风险 | 中（改 store 契约 + 测试） | 低-中（先 UI） |
| 贴片能否删净 | 能删 `liveTailRevision` 链 | 部分仍在（settle 闪切、partial flip） |
| 与 Cursor 模型 | 更接近 stream buffer → settle append | 更接近 CSS 固定底栏 |

**裁决**：备选可作 PR1 验证 UX；**终局必须落到主推的 store 分离**，否则还会回到贴片。

---

## 3. 相对「Bottom Live Dock」的差异与优劣（实现级）

> 对照 worktree `02-20-53-20260805022053` 与本树 **均无** 已实现的 Dock 文档/代码；全树仍是 stick-to-bottom 贴片路线。故「Bottom Live Dock」指目标形态，非现成分支。

| 维度 | 本方案 Turn-Commit | 典型 Bottom Live Dock |
|------|--------------------|------------------------|
| 数据 | `committed[]` + `liveBuffer` 双缓冲 | 常仍单 `messages[]` + `isLive` 过滤 |
| 工具位置 | reduce 不把 open tool 写入 committed | 依赖 render 时把 live group 抽到 Dock |
| 滚动 | Transcript 与 Live **两个布局盒** | 常一个外层 + sticky footer |
| 迁移顺序 | PR1 store 切开 → PR2 UI → PR3 删贴片 | 常 PR1 UI Dock → 后补 store（易半吊子） |
| 风险 | 测试面大（sessionStore / streamCore） | 首屏快，长期双路径 |
| 优势 | 贴底规则 ≤3；可真正 freeze 旧 scroll 模块 | 改动面看起来小 |
| 劣势 | 首 PR 不可见 UX | 不改 reduce 则 LIVE 中插随时回流 |

**本方案迁移顺序必须具体到文件（见 §5）**，避免「先 Dock 永远不 commit」。

---

## 4. 要删除 / 冻结的旧模块（真实路径）

工作根：  
`/Users/zhongshengjieweilai/Desktop/AllBeingsFuture/.allbeingsfuture-worktrees/child-stream-ui-alt-fb7abb24/`

### 4.1 终局 freeze → delete（贴底债）

| 路径 | 动作 | 理由 |
|------|------|------|
| `frontend/src/components/conversation/useConversationScroll.ts` | **大幅删减 → 替换为 `useSessionViewport`** | stick/detach/force 窗口/双 RO/`liveTailRevision` 主战场 |
| `frontend/src/components/conversation/ConversationView.tsx` 内 `liveTailRevision` / `preferLiveMessages` / `LIVE_RENDER_HOLD_MS` / `groupIsLive` live 增高 estimate | **删除** | 混装 live 专用 |
| `frontend/src/components/conversation/useVirtualizedList.ts` 的 `shouldPreferGrowingEstimate` live 路径 | **冻结后删** | 仅为 token 生长撑 spacer |
| `frontend/src/components/conversation/__tests__/useConversationScroll.test.ts` 中 re-pin / liveTail 用例 | **改写** | 契约变 |
| `frontend/src/components/conversation/__tests__/estimateMessageGroupHeight.test.ts` 中 in-flight tool grow | **改写** | live 不再估高 transcript |

### 4.2 迁移后搬迁（非杀）

| 路径 | 动作 |
|------|------|
| `ToolOperationGroup.tsx` / `ToolUseCard.tsx` | settled 留 Transcript；live 实例进 `LiveToolsRail` |
| `AgentActivityPanel.tsx` | 移入 `LiveStage`（已在列表后，几何上应出 scroll） |
| `agentStreamCore.ts` `reduceAgentStreamEvent` | 改为写 liveBuffer；terminal 调 `commitTurn` |
| `sessionSnapshotStore.ts` | 瘦身为 session 列表 + 选中壳；stream 抽出 |

### 4.3 保留不动（数据契约）

- `frontend/src/types/agentStreamTypes.ts`
- `frontend/src/hooks/agentStreamIpc.ts`
- `frontend/src/core/chat/agentStreamBatch.ts`
- `frontend/docs/acp-renderer-streaming.md`
- `electron/services/agent-stream-normalizer.ts`（除非 sequence 契约变）
- 父/子 sessionId 分桶隔离语义与测试锁

---

## 5. 迁移顺序（2–3 个 PR）与风险

### PR1 — Store 切开（无大 UI  diff，可暗开关）

**触碰**

- 新：`sessionStreamStore.ts`、`turnCommit.ts`、`sessionStreamTypes.ts`
- 改：`sessionSnapshotStore.ts`（委托 stream handlers）
- 改：`agentStreamCore.ts`（内部可先 `live` 镜像回混装 `messages` 保持旧 UI）
- 测：`stores/__tests__/sessionStore.test.ts`、`core/chat/__tests__/agentStreamCore.test.ts`

**验收**

- 父/子切换、后台子 force poll、active 不 clobber 行为与现测试一致  
- 新 API：`getEntry(sessionId).{committed,live,stream}` 可单测

**风险**：中。双写过渡期需防 committed/live 分叉。  
**回滚**：feature flag `STREAM_SPLIT_SURFACE=false` 只走旧混装投影。

### PR2 — LiveStage UI + Transcript 只读 committed

**触碰**

- 新：`LiveStage.tsx`、`TranscriptViewport.tsx`、`useSessionViewport.ts`
- 改：`ConversationView.tsx` 拆壳（或薄包装）
- 改：`MainPanel`/`SessionPanel` 若直接挂 CV 则接线不变
- 测：`conversation-view.test.tsx`、`agent-activity-panel.test.tsx`、`tool-operation-group.test.tsx`

**验收**（对用户 3 类截图）

1. **LIVE 工具在底部**：流中工具只在 LiveStage；Transcript 无 LIVE 角标中插  
2. **自动流式刷新**：follow 时 LiveStage 实时；Transcript 不因 token 抖动滚动条  
3. **开子即最新**：select 子 → follow + Live/尾部 committed 可见，无需手滚  

**风险**：中高（布局、composerClearance、短会话 align）。  
**减险**：先非 virtualize 短会话，再开虚化。

### PR3 — 删除贴片 + 简化 virtualizer

**触碰**

- 删/重写：`useConversationScroll.ts` 贴片逻辑  
- 简化：`useVirtualizedList.ts` growing estimate  
- 删：CV 内 `liveTailRevision`、LIVE hold  
- 测：重写 scroll/virtual 测试为 viewport 模型  

**风险**：低-中（行为面已变，删除反降低复杂度）。  
**完成定义**：`rg liveTailRevision` / `shouldPreferGrowingEstimate` 无生产引用。

---

## 6. 验收场景（映射用户痛点）

| # | 场景 | 操作 | 期望 |
|---|------|------|------|
| S1 | LIVE 工具底部 | 父会话跑含 tool 的 turn | LiveToolsRail 在输入框上；历史列无 LIVE 中插 |
| S2 | 流式自动刷新 | follow 下连续 text_delta + tool stdout | LiveStage 连续更新；用户未上滑时始终看到最新 live |
| S3 | 阅读历史不打断 live | 上滑 Transcript | scrollMode=free；LiveStage 仍更新；出现 JumpToLatest |
| S4 | 开子会话最新 | 子在后台跑完或在跑时点侧栏 | 打开即 follow；settled 见尾；running 见 LiveStage |
| S5 | 父不镜像子 live | 子 stream 时停在父会话 | 父 messages/streaming 不变（现有测试锁） |
| S6 | settle 一次落盘 | turn done | Live 清空；Transcript 末尾一次出现完整 turn；无 700ms 闪回依赖 |
| S7 | 发送再 follow | free 中点发送 | scrollMode→follow + pin |

---

## 7. 文件地图（实现清单）

### 7.1 必读现状

```
frontend/src/components/conversation/ConversationView.tsx
frontend/src/components/conversation/useConversationScroll.ts
frontend/src/components/conversation/useVirtualizedList.ts
frontend/src/components/conversation/AgentActivityPanel.tsx
frontend/src/components/conversation/ToolOperationGroup.tsx
frontend/src/components/conversation/ToolUseCard.tsx
frontend/src/stores/sessionSnapshotStore.ts
frontend/src/core/chat/agentStreamCore.ts
frontend/src/core/chat/agentStreamBatch.ts
frontend/src/hooks/agentStreamIpc.ts
frontend/src/app/runtime/installWorkbenchRuntime.ts
frontend/src/types/agentStreamTypes.ts
frontend/docs/acp-renderer-streaming.md
```

### 7.2 新增

```
frontend/src/stores/sessionStreamStore.ts
frontend/src/core/chat/turnCommit.ts
frontend/src/types/sessionStreamTypes.ts
frontend/src/components/conversation/LiveStage.tsx
frontend/src/components/conversation/TranscriptViewport.tsx
frontend/src/components/conversation/useSessionViewport.ts
frontend/docs/stream-ui-architecture.md   # 实现时从本 alt 定稿
```

### 7.3 终局 kill_list

```
useConversationScroll 贴底状态机主体
ConversationView.liveTailRevision / preferLiveMessages / LIVE_RENDER_HOLD_MS
useVirtualizedList.shouldPreferGrowingEstimate（live 用途）
estimateMessageGroupHeight 对 in-flight tool 的特殊加高（迁 Live 后）
```

---

## 8. 为何能打赢 stick-to-bottom 补丁路线

1. **问题从控制论降为布局**：live 高度与 history scroll 解耦，删除 re-pin 反馈环。  
2. **用户心智对齐**：LIVE = 底部舞台；历史 = 可翻书。  
3. **父子同管线**：继续 sessionId 单订阅，不引入 parent mirror。  
4. **可删债**：历史几十次 fix 的测试可整类退役，而不是再加 case。  
5. **迁移可门禁**：PR1 双写暗开关，PR2 UX 可见，PR3 删代码——每步可回滚。

---

## 9. VERDICT 评分说明

- **simplicity 8**：规则 3 条 + 两区布局；store 多一层但语义更短。  
- **migration_risk 6**：PR1–2 有双写与布局风险，但有 flag；低于「一次性 rewrite CV」。  
- **fix_user_bugs 9**：三类截图痛点都有结构级保证，而非阈值调参。
