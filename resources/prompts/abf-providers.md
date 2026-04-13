# AllBeingsFuture Provider 适配规则

## Provider 概览

ABF 通过 BridgeManager 统一管理多个 AI Provider 适配器，每个 Provider 有不同的通信方式和能力边界。

## Provider 列表与特性

| Provider | Adapter Key | 通信方式 | MCP 支持 | 适合场景 |
|----------|-------------|---------|---------|---------|
| Claude Code | `claude-sdk` | in-process (SDK 直接调用) | 原生支持 | 复杂架构设计、多文件重构、Supervisor 调度 |
| Codex CLI | `codex-appserver` | subprocess JSON-RPC | 原生支持（CLI config 注入） | 写代码、修 bug、加功能 |
| Gemini | `gemini-headless` | CLI subprocess | 不支持 | 大文件分析、代码审查、文档总结 |
| OpenCode | `opencode-sdk` | SDK/CLI | 原生支持 (OPENCODE_CONFIG env) | 代码生成和补全 |

## 别名映射 (bridge.ts)

用户输入的 Provider 名称会被规范化到实际的 Adapter Key：

```
claude / claude-code / claude_cli  →  claude-sdk
codex / codex-cli                  →  codex-appserver
gemini / gemini-cli                →  gemini-headless
opencode / opencode-cli            →  opencode-sdk
```

开发时注意：新增别名需要在 `bridge.ts` 的 `normalizeProviderKey()` 中添加映射。

## Provider 能力注册 (ProviderCapabilityRegistry.ts)

每个 Provider 在能力注册表中声明支持的功能：

```typescript
{
  mcpSupport: 'native' | 'prompt-injection' | 'none',
  skillSupport: 'slash-command' | 'system-prompt' | 'none',
  systemPromptSupport: boolean,
}
```

### MCP 支持等级

1. **native** — Provider 原生支持 MCP 协议，直接传入 MCP 配置
   - Claude Code SDK：通过 `config.mcpServers` 参数传入
   - Codex CLI：通过 `codex -c mcp_servers.<name>... app-server` 的 CLI 配置覆盖传入
   - OpenCode：通过 `OPENCODE_CONFIG` 环境变量配置
2. **prompt-injection** — Provider 不支持 MCP，ABF 将 MCP 工具描述注入到 system prompt 中
3. **none** — 不支持 MCP
   - Gemini CLI


开发时注意：新增 Provider 必须在 `ProviderCapabilityRegistry.ts` 注册能力，否则 MCP 注入和 Skill 分发会失败。

## 适配器开发规范

### 文件位置

所有适配器在 `electron/bridge/adapters/` 目录下，每个 Provider 一个文件。

### 适配器必须实现的接口

1. **启动会话** — 初始化 Provider 连接，传入 system prompt 和 MCP 配置
2. **发送消息** — 将用户消息转发给 Provider
3. **接收输出** — 将 Provider 输出转为统一事件格式（通过 OutputParser）
4. **关闭会话** — 清理资源

### 输出解析

- 每个 Provider 在 `electron/parser/` 下有对应的 `*Rules.ts` 解析规则
- `OutputParser.ts` 根据 Provider 类型选择对应规则
- 所有输出最终转为统一的 `ActivityEventType`（定义在 `toolMapping.ts`）

### 工具映射 (toolMapping.ts)

不同 Provider 的工具名称不同，但需要映射到统一的 ActivityEventType：

- Claude 的 `Read` / Codex 的 `read_file` → 统一为 `file_read` 事件
- Claude 的 `Edit` / Codex 的 `apply_patch` → 统一为 `file_edit` 事件

开发时注意：新增 Provider 的工具必须在 `toolMapping.ts` 中添加映射，否则 UI 无法正确显示工具执行状态。

## Supervisor 与子 Agent 的 Provider 选择

- Supervisor 始终是 Claude Code SDK（因为只有它原生支持 MCP，能调度其他 Agent）
- 子 Agent 可以是任意 Provider，由 Supervisor 在 `spawn_agent` 时通过 `provider` 参数指定
- `supervisor-prompt.ts` 会动态读取已配置的 Provider 列表，注入到 Supervisor 的规则中

## 额度不足降级策略

当某个 Provider 报额度不足错误时，建议按以下顺序切换：

```
claude-code → gemini-cli → codex → opencode
```

## 注意事项

- Claude SDK 是 in-process 运行，崩溃会影响主进程，需要做好错误隔离
- Codex CLI 是独立子进程，通过 JSON-RPC 通信，注意进程僵死和超时处理
- 所有 Provider 的 API Key / 认证信息通过 `electron/services/provider.ts` 管理，存储在 SQLite 的 `providers` 表中
- 不要在代码或日志中明文输出 API Key
