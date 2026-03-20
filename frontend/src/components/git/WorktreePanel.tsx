import { useState, useEffect } from 'react'
import { GitBranch, FolderOpen, Trash2, GitMerge, Check, AlertTriangle, RefreshCw, Plus } from 'lucide-react'
import { useGitStore } from '../../stores/gitStore'
import type { WorktreeInfo, MergeResult } from '../../../bindings/allbeingsfuture/internal/models/models'

export default function WorktreePanel() {
  const {
    worktrees, status, currentRepo, loading,
    setRepo, loadStatus, loadWorktrees, isGitRepo,
    createWorktree, removeWorktree, mergeWorktree, checkMerge,
  } = useGitStore()

  const [repoInput, setRepoInput] = useState(currentRepo)
  const [isValid, setIsValid] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)

  // Validate repo and load data
  const handleSetRepo = async () => {
    if (!repoInput) return
    const valid = await isGitRepo(repoInput)
    setIsValid(valid)
    if (valid) {
      setRepo(repoInput)
      loadStatus(repoInput)
      loadWorktrees(repoInput)
    }
  }

  useEffect(() => {
    if (currentRepo) {
      setRepoInput(currentRepo)
      handleSetRepo()
    }
  }, [])

  const handleRefresh = () => {
    if (currentRepo) {
      loadStatus()
      loadWorktrees()
    }
  }

  const handleCheckMerge = async (wt: WorktreeInfo) => {
    if (!currentRepo || wt.isMain) return
    const mainBranch = status?.branch ?? 'main'
    const result = await checkMerge(currentRepo, wt.branch, mainBranch)
    setMergeResult(result)
  }

  const handleMerge = async (wt: WorktreeInfo) => {
    if (!currentRepo || wt.isMain) return
    const mainBranch = status?.branch ?? 'main'
    const result = await mergeWorktree(currentRepo, wt.branch, mainBranch)
    setMergeResult(result)
    if (result?.success) {
      handleRefresh()
    }
  }

  const handleRemove = async (wt: WorktreeInfo) => {
    if (!currentRepo || wt.isMain) return
    if (!confirm(`确定删除 Worktree "${wt.branch}"？此操作将删除工作目录和分支。`)) return
    await removeWorktree(currentRepo, wt.path, true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top: Repo input + status bar */}
      <div className="shrink-0">
        {/* Repo selector */}
        <div className="p-4 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Git Worktree 管理</h2>
          <div className="flex gap-2">
            <input
              value={repoInput}
              onChange={e => setRepoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetRepo()}
              placeholder="输入 Git 仓库路径..."
              className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
            <button
              onClick={handleSetRepo}
              className="px-3 py-2 bg-dark-accent text-white text-sm rounded-lg hover:bg-blue-600"
            >
              <FolderOpen size={16} />
            </button>
          </div>
          {repoInput && !isValid && currentRepo !== repoInput && (
            <p className="text-xs text-red-400 mt-1">不是有效的 Git 仓库</p>
          )}
        </div>

        {/* Status bar */}
        {status && (
          <div className="px-4 py-2.5 border-b border-dark-border bg-dark-bg/50 flex items-center gap-3 text-xs">
            <span className="text-gray-400">分支:</span>
            <code className="text-emerald-400">{status.branch}</code>
            {status.ahead > 0 && <span className="text-blue-400">↑{status.ahead}</span>}
            {status.behind > 0 && <span className="text-orange-400">↓{status.behind}</span>}
            <button onClick={handleRefresh} className="ml-auto text-gray-500 hover:text-white">
              <RefreshCw size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Middle: Scrollable area */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {!currentRepo ? (
          <div className="text-center text-gray-500 py-12 px-4">
            <GitBranch size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-base">Git Worktree 隔离管理</p>
            <p className="text-sm mt-2 text-gray-600">
              每个任务在独立的分支目录中工作，彻底隔离代码修改。
              适合并行开发场景，避免多会话互相干扰。
            </p>
          </div>
        ) : loading ? (
          <div className="text-center text-gray-500 text-sm py-12">加载中...</div>
        ) : (
          <div className="p-2 space-y-1">
            {/* Worktree list */}
            {worktrees.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-12">
                <p>暂无 Worktree</p>
                <p className="text-xs mt-1">点击下方按钮创建</p>
              </div>
            ) : (
              worktrees.map(wt => (
                <WorktreeCard
                  key={wt.path}
                  worktree={wt}
                  onCheckMerge={() => handleCheckMerge(wt)}
                  onMerge={() => handleMerge(wt)}
                  onRemove={() => handleRemove(wt)}
                />
              ))
            )}

            {/* Repo status details */}
            {status && (
              <div className="space-y-4 pt-3 mt-3 border-t border-dark-border">
                <h3 className="text-sm font-semibold">仓库状态</h3>

                <div className="grid grid-cols-3 gap-2">
                  <StatusCard label="暂存区" count={status.staged.length} color="text-green-400" />
                  <StatusCard label="未暂存" count={status.unstaged.length} color="text-yellow-400" />
                  <StatusCard label="未跟踪" count={status.untracked.length} color="text-gray-400" />
                </div>

                {/* File lists */}
                {status.staged.length > 0 && (
                  <FileList title="暂存的文件" files={status.staged} color="text-green-400" />
                )}
                {status.unstaged.length > 0 && (
                  <FileList title="未暂存的修改" files={status.unstaged} color="text-yellow-400" />
                )}
                {status.untracked.length > 0 && (
                  <FileList title="未跟踪的文件" files={status.untracked} color="text-gray-500" />
                )}

                {status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-8">
                    <Check size={24} className="mx-auto mb-2 text-green-400" />
                    工作目录干净，无待提交的更改
                  </div>
                )}
              </div>
            )}

            {/* Merge result */}
            {mergeResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                mergeResult.success
                  ? 'bg-green-900/20 border-green-800/30'
                  : mergeResult.hasConflicts
                    ? 'bg-red-900/20 border-red-800/30'
                    : 'bg-yellow-900/20 border-yellow-800/30'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {mergeResult.success ? (
                    <Check size={16} className="text-green-400" />
                  ) : (
                    <AlertTriangle size={16} className="text-red-400" />
                  )}
                  <span className="text-sm font-medium">
                    {mergeResult.success
                      ? mergeResult.autoResolved
                        ? '自动合并成功（保留双方改动）'
                        : '合并成功'
                      : mergeResult.hasConflicts
                        ? '冲突自动合并失败'
                        : '合并检查'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{mergeResult.message}</p>
                {mergeResult.conflictFiles && mergeResult.conflictFiles.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-500">
                      {mergeResult.autoResolved ? '已自动解决的冲突文件:' : '冲突文件:'}
                    </span>
                    {mergeResult.conflictFiles.map(f => (
                      <div key={f} className={`text-xs ml-2 ${mergeResult.autoResolved ? 'text-emerald-300' : 'text-red-300'}`}>
                        {mergeResult.autoResolved ? '✓' : '•'} {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: Create button */}
      {currentRepo && (
        <div className="shrink-0 p-2 border-t border-dark-border">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="w-full py-2 text-sm text-emerald-400 hover:bg-emerald-900/20 rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <Plus size={14} /> 创建新的 Worktree
          </button>
        </div>
      )}

      {/* Create dialog */}
      {showCreateDialog && (
        <CreateWorktreeDialog
          repoPath={currentRepo}
          onCreated={() => { setShowCreateDialog(false); handleRefresh() }}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

function WorktreeCard({
  worktree,
  onCheckMerge,
  onMerge,
  onRemove,
}: {
  worktree: WorktreeInfo
  onCheckMerge: () => void
  onMerge: () => void
  onRemove: () => void
}) {
  return (
    <div className="px-3 py-2.5 rounded-lg hover:bg-dark-hover group transition-colors">
      <div className="flex items-center gap-2">
        <GitBranch size={14} className={worktree.isMain ? 'text-emerald-400' : 'text-blue-400'} />
        <span className="text-sm font-medium flex-1 truncate">{worktree.branch}</span>
        {worktree.isMain && (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/40 text-emerald-400 rounded">主</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1 truncate ml-5">{worktree.path}</div>
      <div className="text-[10px] text-gray-600 mt-0.5 ml-5 font-mono">{worktree.headCommit.slice(0, 8)}</div>

      {!worktree.isMain && (
        <div className="hidden group-hover:flex gap-1 mt-2 ml-5">
          <button
            onClick={onCheckMerge}
            className="px-2 py-1 text-[10px] bg-dark-bg border border-dark-border rounded text-gray-400 hover:text-white"
          >
            检查冲突
          </button>
          <button
            onClick={onMerge}
            className="px-2 py-1 text-[10px] bg-emerald-900/30 border border-emerald-800/30 rounded text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
          >
            <GitMerge size={10} /> 合并
          </button>
          <button
            onClick={onRemove}
            className="px-2 py-1 text-[10px] bg-red-900/30 border border-red-800/30 rounded text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <Trash2 size={10} /> 删除
          </button>
        </div>
      )}
    </div>
  )
}

function StatusCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="px-4 py-3 bg-dark-card rounded-lg border border-dark-border">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${count > 0 ? color : 'text-gray-600'}`}>{count}</div>
    </div>
  )
}

function FileList({ title, files, color }: { title: string; files: string[]; color: string }) {
  const [expanded, setExpanded] = useState(false)
  const display = expanded ? files : files.slice(0, 5)

  return (
    <div>
      <h4 className="text-xs text-gray-500 mb-1">{title} ({files.length})</h4>
      <div className="space-y-0.5">
        {display.map(f => (
          <div key={f} className={`text-xs font-mono ${color} truncate`}>• {f}</div>
        ))}
        {files.length > 5 && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-xs text-dark-accent hover:text-blue-400">
            显示全部 ({files.length})
          </button>
        )}
      </div>
    </div>
  )
}

function CreateWorktreeDialog({
  repoPath,
  onCreated,
  onClose,
}: {
  repoPath: string
  onCreated: () => void
  onClose: () => void
}) {
  const createWorktree = useGitStore(s => s.createWorktree)
  const [branch, setBranch] = useState('')
  const [taskId, setTaskId] = useState(() => `task-${Date.now()}`)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!branch) return
    setCreating(true)
    const result = await createWorktree(repoPath, branch, taskId)
    setCreating(false)
    if (result) onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-card rounded-xl border border-dark-border w-[440px] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">创建 Git Worktree</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">分支名称</label>
            <input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="feature/my-task"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">任务 ID</label>
            <input
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Worktree 路径: {repoPath}/.allbeingsfuture-worktrees/{taskId}/
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!branch || creating}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            {creating ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
