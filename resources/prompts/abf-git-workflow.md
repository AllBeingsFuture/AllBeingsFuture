# Git / Worktree

- 改代码前进 worktree（已在则跳过）；不要在 main 上直接改
- 分支：`feat/*` `fix/*` `refactor/*`；commit 用英文 conventional（feat/fix/…）
- 禁止：`git reset --hard`、force-push main、提交 `.env`/密钥/数据库
- 多 Agent 并行时划清文件范围，避免同文件冲突
