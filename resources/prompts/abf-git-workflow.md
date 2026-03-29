# AllBeingsFuture Git 与代码推送流程

## 仓库信息

- **主分支**: `main`
- **远程仓库**: `origin` (GitHub) + `gitee` (Gitee 镜像)
- **工作流**: 基于 Git Worktree 的隔离开发

## 分支规范

### 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能开发 | `feat/<模块>-<描述>` | `feat/parser-gemini-support` |
| Bug 修复 | `fix/<描述>` | `fix/session-idle-detection` |
| 重构 | `refactor/<描述>` | `refactor/bridge-adapter-interface` |
| Worktree 自动分支 | `worktree/<描述>` | `worktree/ui-components-migration` |

### 分支管理原则

- `main` 分支保持可构建状态，不直接在 main 上开发
- 所有代码修改通过 worktree 分支或功能分支进行
- 合并到 main 使用 `--no-ff`（保留合并记录）
- 合并完成后清理 worktree 分支

## Commit 规范

### 格式

```
<type>: <简短描述>

[可选的详细说明]
```

### Type 列表

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add Gemini CLI adapter` |
| `fix` | Bug 修复 | `fix: resolve session idle race condition` |
| `refactor` | 重构（不改变行为） | `refactor: extract OutputParser from bridge` |
| `chore` | 杂项（构建、依赖、配置） | `chore: update electron-builder to v25` |
| `docs` | 文档 | `docs: add provider integration guide` |
| `test` | 测试 | `test: add conversation view tests` |
| `style` | 代码风格（不影响逻辑） | `style: fix indentation in handlers.ts` |

### Commit 注意事项

- 每个 commit 应该是一个逻辑完整的改动，不要把多个不相关的修改混在一起
- commit message 用英文，简短清晰
- 不要提交 `.env`、API Key、数据库文件 (`.db`)
- 不要提交 `node_modules/`、`electron/dist/`、`frontend/dist/`

## Worktree 工作流（ABF 强制流程）

ABF 平台使用 Git Worktree 实现代码隔离，避免多 Agent 并行修改冲突。
**所有涉及代码修改的任务都必须在 worktree 中进行，不允许直接在 main 分支上修改代码。**
只读探索、搜索、阅读、分析可以先在当前目录进行；**真正开始改代码前**才需要进入 worktree。

### 标准流程

```
1. 在开始任何写操作前进入隔离环境（必做，不需要用户显式要求）
   - 如果平台提供 `enter_worktree` 工具，优先调用它
   - 如果没有专用工具，但可以执行 Git 命令，则先自行创建/进入 worktree
     git rev-parse --show-toplevel
     git worktree add ".abf-worktrees/<name>" -b "worktree/<name>"
   - 进入 worktree 后，后续所有写文件、测试、提交、合并都必须针对 worktree 路径执行

3. 在 worktree 中完成修改并提交
   git add <files>
   git commit -m "feat: ..."

4. 合并回 main
   cd <项目根目录>
   git merge <worktree-branch> --no-ff

5. 清理 worktree
   git worktree remove .claude/worktrees/<name> --force
   git branch -d <worktree-branch>
```

### Worktree 注意事项

- 不要因为“刚新建会话”就立刻创建 worktree；只有准备改代码时才进入
- Worktree 基于已提交的 HEAD 创建，未提交的改动不会带入
- 多个 Agent 不要修改同一文件，按文件范围分工
- 如果 worktree 代码与 main 不同步，在 worktree 中执行 `git merge main`
- 不要在 worktree 中执行 `git checkout`、`git reset --hard` 等破坏性操作

## 推送到远程仓库

### 推送到 GitHub (origin)

```bash
git push origin main
```

### 同步到 Gitee 镜像

```bash
git push gitee main
```

### 推送新分支

```bash
git push -u origin <branch-name>
```

### 推送注意事项

- 永远不要 force push main 分支
- 推送前确认本地 main 已合并所有 worktree 分支
- 推送前确认构建通过：`npm run build`
- 如果远程有新提交，先 `git pull --rebase origin main` 再推送

## .gitignore 关键规则

以下文件/目录不会被提交：

```
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
```

## 代码修改后的验证清单

在提交和推送前，确认：

1. **构建通过**
   ```bash
   npm run build
   ```

2. **前端测试通过**（如果改了 frontend）
   ```bash
   cd frontend && npm test
   ```

3. **没有引入敏感信息**
   ```bash
   git diff --cached    # 检查 staged 内容
   ```

4. **commit message 符合规范**

5. **确认推送目标分支正确**
