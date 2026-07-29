# Provider 选择（调度时参考）

| 场景 | Provider |
| ---- | -------- |
| 复杂架构 / 强调度 | claude-code |
| 写代码 / 修 bug | codex |
| 大文件分析 / 审查 | gemini-cli |
| 轻量生成 | opencode |

额度不足：`claude-code → gemini-cli → codex → opencode`
