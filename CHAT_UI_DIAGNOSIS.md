# 聊天 UI 诊断报告（流式 + 滚动）

**日期：** 2026-08-05  
**分支 / worktree：** `ao/allbeingsfuture-3/root`  
**范围：** `frontend` 会话消息、agent 流式、虚拟列表、stick-to-bottom

---

## 0. 本会话已做 / 未做（现状摘要）

| 状态 | 内容 | Commit |
|------|------|--------|
| ✅ 已做 | 终态 finalize 清除 `tool_use.isDelta`、收敛 open `toolStatus` | `74df920` |
| ✅ 已做 | **结构性**：取消 silence fail-open 抢内容权；活跃 turn 只认 `agent:stream` | `8f362cc` |
| ✅ 已做 | **滚动 v1**：假贴底禁止误 re-attach；虚拟列表 group key 稳定化 | `2fc2d70` |
| ✅ 已做 | **滚动 v2（用户确认 ended 也坏）**：贴底仅当 `isNearBottom`；settled 不因 revision 强拉；长历史关闭 bottom-align | 见 §F 最新 commit |
| ✅ 已做 | 回归测试：双通道 silence、finalize、假贴底、getGroupKey、**settled 上滑** | 同上 |
| ❌ 未做 | 后端停双发 `chat:update`（仍双 emit，前端已忽略 mid-turn） | — |
| ❌ 未做 | 嵌套 `overflow-y-auto`（工具/思考块）wheel 不冒泡（次要） | — |
| ❌ 未做 | Conversation 模块整体重写 / 换前端栈 | 不建议，见 §D |
| ❌ 未做 | push / 开 PR | 按约束禁止 |

---

## A. 提交史诊断（近 30 条 fix(chat) / conversation 相关）

### A.1 时间线归类

| 类别 | 代表 commit | 各自修啥 | 是否打架 | 为何仍坏 |
|------|-------------|---------|----------|----------|
| **双通道引入** | `a851e2e` ACP UX · `0e40bc0` 双 emit | 新增 `agent:stream`，保留 legacy chat | 天生双真相源 | 后续全是「谁拥有 messages」的补丁 |
| **IPC 全局化** | `508b511` | 视图卸载不丢流 | 好 | 不解决双写 |
| **Silence fail-open** | `9ed7265` | 12s 静默后把内容权交 legacy | **与文档/stream 主路径打架** | 形状不一致 → 冻工具/分叉气泡 |
| **Silence 后补丁瀑布** | `2660bcf` annotate · `7974643` toolStatus · `b811267` isDelta/partial · `f6540ec` partial 类型 | 适配 legacy 缺字段 | 叠 if，互相关联 | 根因未除则再回归 |
| **多轮气泡** | `bea8f9f` · `d41871c` | 工具后新开气泡、seal partial | 与 trailing merge 规则纠缠 | 双源覆盖时又分叉 |
| **Stick-to-bottom** | `3179eab` · `2cbbb6c` · `0fc9351` · `90f73e1` · `2129b4d` · `4df2b6c` | 上滑 detach、rAF batch、发送再贴底、token 增高 re-pin | **贴底 vs 上滑** 反复对打 | 假贴底 re-attach、key 漂移未锁 |
| **虚拟列表空白** | `f0f040d` thinking · `bb87272` growing estimate lead · `7d39dd0` bottom-align | 估高/估低 spacer | 估高空白 vs 估低假贴底 | 估低 → 误 re-attach 再贴底 |
| **工具组 UI** | `23755c8` · `a1dae9d` · `bd98d02` | 默认折叠 vs 流式展开 | 产品语义反复 | 与 live 标记纠缠 |
| **本会话收敛** | `74df920` · `8f362cc` · `2fc2d70` | 终态 live 标记 + **内容所有权** + **假贴底/key** | 统一方向 | 后端双发仍在，需靠前端纪律 |

### A.2 「修 A 坏 B」模式（用户失去耐心的原因）

```
agent:stream 为 live 真相
        ↓ 卡死恐惧
silence 把内容交给 chat:update/patch   ← 9ed7265
        ↓ legacy 无 partial / toolUseId
UI 冻成「执行了 / 思考完成」            ← 用户可见
        ↓
annotate + 双 id + isDelta 补丁串       ← 2660bcf…b811267
        ↓ 同时 stick-to-bottom 为跟流
流式 RO 增高抢视口                      ← 用户「滑不上去」
        ↓
detach / suppress 正补偿 / 假贴底 re-attach 补丁串
        ↓ 虚拟 key 用 index
工具插入 → key 变 → 丢测量 → 空白/跳
```

**结论：** 不是「前端工程师不够努力」，而是 **双通道 + 中途换主人 + 贴底/虚拟列表耦合** 导致局部补丁必然搬家症状。

---

## B. 根因清单（按严重度）

### P0 — 内容真相源分裂（已收敛前端策略）

- **现象：** 字跳变、丢段、工具状态错、气泡合并/分叉。  
- **根因：** `process.ts` 双发；前端曾用 silence 把 mid-turn transcript 交给 legacy。  
- **状态：** `8f362cc` 后：活跃 phase **仅** `agent:stream` 改内容；legacy 只允许 user append 与 `streaming:false` 终态对账。  
- **残留：** 后端仍双发（噪声/浪费）；若某 provider **不发** `agent:stream` 会静默。

### P0 — 滚动「输出中 + 输出结束都滑不上去」（用户确认）

用户明确：**不限于 streaming**，结束后一样。

| 子因 | 为何 ended 也坏 | 修复 |
|------|-----------------|------|
| **A. stick 默认 true，不要求 isNearBottom** | 只要未 detach，**任意** RO（markdown 终态重排、字体、composer 测高、poll 后 layout）都会 `scrollToBottom`。流式 token 与 settled remeasure 走同一路径。 | `shouldStickToBottom` **必须** `isNearBottom` |
| **B. settled 仍喂 liveTailRevision 类 pin** | `preferLiveMessages` 结束后仍有 length-stable 重渲染；旧逻辑在 `streaming` 窗口内 revision 强拉。 | 仅 `streaming===true` 时 revision 跟底；settled 只在 **消息条数增加且仍贴底** 时跟 |
| **C. 假贴底 re-attach** | spacer 低估 → 中部也像 near-bottom → 微下滚 re-stick | 需曾真正远离底部才 re-attach |
| **D. group key = index** | 工具插入 key 变 → 丢测量 → scroll 范围错（stream/settled 都有） | 稳定 id key |
| **E. 长历史仍 bottom-align** | `7d39dd0` 为短流加的 `minHeight=viewport + justify-end` 套在长历史上，干扰 scrollHeight 感知 | **仅短会话**启用 bottom-align |

**代码路径（ended 为何会锁滚）：**

```
stream ends → markdown/partial→settled remount heights
  → content ResizeObserver → preserveScrollAnchorOnContentResize
  → 旧: shouldStickToBottom() === true（默认 stick，仅看 detach）
  → scrollToBottom()  ← 用户若刚上滑未成功 detach，或 RO 在 detach 前开火
  → 视口被钉在底部（streaming 与 settled 相同）
```

新纪律：

```
shouldStick = !detached && intent!=='up' && isNearBottom
// 用户上滑 → detach + isNearBottom=false → 任何 RO/revision 不得 pin
// 仅「已在贴底带 + 新内容」才跟底
```

### P1 — 终态 live 标记残留（已修）

- **现象：** 回合结束后工具组仍像「执行中」、虚拟列表仍 growing estimate。  
- **根因：** `finalizeMessages` 保留 `tool_use.isDelta`、不收敛 `toolStatus`。  
- **状态：** `74df920`。

### P1 — 贴底与 RO / liveTailRevision（纪律已收紧）

- **机制：** `useConversationScroll` + 双 ResizeObserver + `liveTailRevision`。  
- **正确纪律：** 上滑优先；**仅贴底带**自动跟；settled 不因 revision 强拉；阅读历史禁止虚拟列表正补偿。

### P2 — 工具卡 / 折叠语义产品抖动

- 默认折叠 vs 流式展开多次改；与 partial 标记耦合。非滚动主因。

### P2 — 多 session 串台

- store 按 `sessionId` 分 buffer；父选中时子流不写 selected messages（`7974643`）。需持续用测试锁。

### P3 — markdown 重渲染 / 性能

- 流式用 plain pre-wrap，结束后 markdown；偶发闪烁，非「滑不上去」主因。

---

## C. 收敛修复（本 worktree）

### C.1 代码

| 文件 | 改动 |
|------|------|
| `agentStreamCore.ts` | phase-only 内容所有权；finalize 清 isDelta / toolStatus |
| `sessionSnapshotStore.ts` | mid-turn 忽略 legacy 内容；poll 仅终态对账 |
| `useConversationScroll.ts` | 假贴底 re-attach 门闩；**stick 要求 isNearBottom**；settled 不 revision 强拉 |
| `ConversationView.tsx` | 稳定 `getGroupKey`；**长历史关闭 bottom-align**；透传 `partial` |

### C.2 测试锁

- silence 不得覆盖 stream 行  
- poll(streaming:false) 仍可收敛  
- finalize 后无 live tool 标记  
- 假贴底微下滚不得 re-attach  
- getGroupKey 在 index 漂移时稳定  
- **settled + 上滑后 RO/length  churn 不得 yank**  
- **mid-history 几何下内容增高不得 stick**

### C.3 验证命令

```bash
cd frontend && npm test -- --run
# 期望：全绿（含 conversation scroll / virtual / stream store）
```

### C.4 建议后续（可选，非本会话必做）

1. 后端：active turn 可降频或停发 legacy 全文（前端已不依赖）。  
2. UI：显式「回到底部」按钮，避免依赖假贴底启发式。  
3. 虚拟列表：对无 id 的 legacy 行生成稳定合成 id（持久化时写入）。

---

## D. 产品建议（一句 + 展开）

**不要为了聊天体验换 Vue/整栈重写；应在现有 React 内收敛「conversation 子系统」（stream store + scroll + virtual list）为单一模块并冻结契约。**

| 选项 | 建议 |
|------|------|
| 换 Vue / 重写整个前端 | **不推荐** — 债在会话协议与双通道，不在 React；换栈重付成本且复现同一设计错误 |
| 放弃当前前端 | **过早** — 根因已定位，本会话已收敛内容权 + 滚动劫持两条主轴 |
| 在 React 内重写 conversation 模块 | **若仍反复回归可考虑** — 边界清晰：IPC 入 → reduce → 一个 messages 列表 → 一个滚动容器；删除 silence/annotate 类逃生舱 |
| 继续打点状 fix(chat) | **禁止** — 历史已证明会搬家症状 |

**冻结契约（建议写进 code review）：**

1. 活跃 turn：仅 `agent:stream` 写 transcript。  
2. Legacy：仅 user append + `streaming:false`。  
3. 自动跟底 **仅当** `isNearBottom && !detached && intent!=='up'`。  
4. 用户上滑：任何自动 scrollTop 写入必须先 `shouldStickToBottom()===false`。  
5. 虚拟 key：禁止纯数组 index。  
6. bottom-align（minHeight+justify-end）仅短会话。  
7. 新补丁必须带复现历史 bug 的测试（含 **settled 上滑**）。

---

## E. 用户现象 ↔ 对应根因（速查）

| 用户说法 | 最可能根因 | 本会话 |
|----------|------------|--------|
| 输出内容老有问题 | 双通道 + silence 抢内容 | 已收敛前端 |
| **往上滑滑不上去（中+结束）** | stick 不看 isNearBottom；RO 终态重测；假贴底；key；长史 bottom-align | **已修 v2** |
| 工具一直执行中 | finalize isDelta/toolStatus | 已修 |
| 空白一大截 | growing estimate / thinking 估高 | lead cap + key |
| 修了很多 commit 仍坏 | 补丁叠在错误架构上 | 诊断见 §A |

---

## F. Commit 列表（本 worktree，勿 push）

1. `74df920` — clear live tool markers on terminal events  
2. `8f362cc` — stop silence fail-open from stealing stream content  
3. `2fc2d70` — false-bottom reattach + stabilize virtual keys  
4. `2083186` — docs: diagnosis hashes  
5. （最新）— stick requires near-bottom; settled no revision yank; short-only bottom-align  

以 `git log -6 --oneline` 为准。未 push / 未开 PR。
