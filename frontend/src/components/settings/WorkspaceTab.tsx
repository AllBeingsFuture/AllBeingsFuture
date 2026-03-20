/**
 * 工作区管理设置页
 *
 * 功能：
 *  - 查看 / 创建 / 编辑 / 删除工作区（一组相关 git 仓库的命名集合）
 *  - 创建支持三种入口：手动逐个添加 / 扫描父目录 / 导入 VS Code .code-workspace
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Pencil, FolderSearch, FileCode, Star, StarOff,
  ChevronDown, ChevronRight, Loader2, Check, AlertCircle, FolderOpen,
} from 'lucide-react'
import { ipc } from '../../../bindings/electron-api'
import type { Workspace } from '../../types/workspaceTypes'

// ── IPC 封装（走统一 ipc() 封装，通道名遵循 ServiceName.Method 规范） ──

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const workspaceAPI = {
  list: (): Promise<Workspace[]> =>
    ipc('WorkspaceService.List').catch(() => []),
  create: (data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipc('WorkspaceService.Create', data).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  update: (id: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipc('WorkspaceService.Update', id, data).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  delete: (id: string): Promise<void> =>
    ipc('WorkspaceService.Delete', id),
  scanRepos: (dir: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> =>
    ipc('WorkspaceService.ScanRepos', dir).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  importVscode: (filePath: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> =>
    ipc('WorkspaceService.ImportVscode', filePath).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  isGitRepo: (dir: string): Promise<boolean> =>
    ipc('WorkspaceService.IsGitRepo', dir).catch(() => false),
  selectDirectory: (): Promise<string | null> =>
    ipc('app:selectDirectory').catch(() => null),
}

// ── 工作区列表 Tab ──

export default function WorkspaceTab() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Workspace | null | 'create'>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await workspaceAPI.list()
      setWorkspaces(list || [])
    } catch {
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (ws: Workspace) => {
    if (!confirm(`确认删除工作区「${ws.name}」？此操作不可撤销。`)) return
    try {
      await workspaceAPI.delete(ws.id)
      await load()
    } catch (err: unknown) {
      alert(`删除失败：${errMsg(err)}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">工作区管理</h3>
          <p className="text-xs text-text-muted mt-0.5">
            将多个相关 Git 仓库组合为工作区，任务可绑定工作区自动完成多仓库 worktree 隔离
          </p>
        </div>
        <button
          onClick={() => setEditTarget('create')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新建工作区
        </button>
      </div>

      {/* 工作区列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">加载中…</span>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-text-muted gap-2">
          <FolderSearch className="w-10 h-10 opacity-30" />
          <p className="text-sm">还没有工作区，点击「新建工作区」开始配置</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              expanded={expandedId === ws.id}
              onToggle={() => setExpandedId(expandedId === ws.id ? null : ws.id)}
              onEdit={() => setEditTarget(ws)}
              onDelete={() => handleDelete(ws)}
            />
          ))}
        </div>
      )}

      {/* 创建 / 编辑弹窗 */}
      {editTarget !== null && (
        <WorkspaceEditModal
          workspace={editTarget === 'create' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load() }}
        />
      )}
    </div>
  )
}

// ── 工作区卡片 ──

function WorkspaceCard({
  workspace, expanded, onToggle, onEdit, onDelete,
}: {
  workspace: Workspace
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const primaryRepo = workspace.repos.find(r => r.isPrimary)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-bg-tertiary">
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{workspace.name}</span>
            <span className="text-xs text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded">
              {workspace.repos.length} 个仓库
            </span>
          </div>
          {workspace.description && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{workspace.description}</p>
          )}
          {primaryRepo ? (
            <p className="text-xs text-text-muted mt-0.5 font-mono truncate">
              主仓库：{primaryRepo.repoPath}
            </p>
          ) : (
            <p className="text-xs text-text-muted mt-0.5">无主仓库</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            title="编辑"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 展开仓库列表 */}
      {expanded && (
        <div className="divide-y divide-border">
          {workspace.repos.map((repo) => (
            <div key={repo.id} className="flex items-center gap-2.5 px-4 py-2">
              {repo.isPrimary
                ? <Star className="w-3.5 h-3.5 text-accent-yellow flex-shrink-0" />
                : <div className="w-3.5 h-3.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{repo.name}</span>
                  {repo.isPrimary && (
                    <span className="text-xs text-accent-yellow bg-accent-yellow/10 px-1.5 py-0.5 rounded">
                      主仓库
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted font-mono truncate">{repo.repoPath}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 创建 / 编辑弹窗 ──

type CreateMode = 'manual' | 'scan' | 'vscode'

interface RepoEntry {
  id: string
  repoPath: string
  name: string
  isPrimary: boolean
  valid?: boolean
  checking?: boolean
}

function WorkspaceEditModal({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: Workspace | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = workspace !== null
  const [mode, setMode] = useState<CreateMode>('manual')

  // 表单字段
  const [name, setName] = useState(workspace?.name || '')
  const [description, setDescription] = useState(workspace?.description || '')
  const [repos, setRepos] = useState<RepoEntry[]>(
    workspace?.repos.map(r => ({
      id: r.id,
      repoPath: r.repoPath,
      name: r.name,
      isPrimary: r.isPrimary,
      valid: true,
    })) || []
  )

  // 扫描模式
  const [scanDir, setScanDir] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanResults, setScanResults] = useState<Array<{ repoPath: string; name: string; checked: boolean }>>([])

  // VS Code 导入模式
  const [vscodeFilePath, setVscodeFilePath] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResults, setImportResults] = useState<Array<{ repoPath: string; name: string; checked: boolean }>>([])

  // 提交
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── 手动模式：添加仓库行 ──
  const addRepoRow = () => {
    setRepos(prev => [...prev, {
      id: `new-${Date.now()}`,
      repoPath: '',
      name: '',
      isPrimary: false,
      valid: undefined,
    }])
  }

  const removeRepo = (id: string) => {
    setRepos(prev => prev.filter(r => r.id !== id))
  }

  const setPrimary = (id: string) => {
    setRepos(prev => {
      const target = prev.find(r => r.id === id)
      if (!target) return prev
      if (target.isPrimary) {
        return prev.map(r => ({ ...r, isPrimary: false }))
      }
      return prev.map(r => ({ ...r, isPrimary: r.id === id }))
    })
  }

  const updateRepo = (id: string, field: keyof RepoEntry, value: any) => {
    setRepos(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const selectRepoDir = async (id: string) => {
    const dir = await workspaceAPI.selectDirectory()
    if (!dir) return
    const autoName = dir.split(/[\\/]/).pop() || dir
    setRepos(prev => prev.map(r => r.id === id
      ? { ...r, repoPath: dir, name: r.name || autoName, valid: undefined, checking: true }
      : r
    ))
    // 校验
    const valid = await workspaceAPI.isGitRepo(dir)
    setRepos(prev => prev.map(r => r.id === id ? { ...r, valid, checking: false } : r))
  }

  // ── 扫描模式 ──
  const handleScanDirSelect = async () => {
    const dir = await workspaceAPI.selectDirectory()
    if (dir) setScanDir(dir)
  }

  const handleScan = async () => {
    if (!scanDir) return
    setScanLoading(true)
    setScanResults([])
    try {
      const result = await workspaceAPI.scanRepos(scanDir)
      if (result.success) {
        setScanResults((result.repos || []).map(r => ({ ...r, checked: true })))
      } else {
        setError(result.error || '扫描失败')
      }
    } catch (err: unknown) {
      setError(errMsg(err))
    } finally {
      setScanLoading(false)
    }
  }

  const applyScanResults = () => {
    const selected = scanResults.filter(r => r.checked)
    if (selected.length === 0) return
    setRepos(prev => {
      const existingPaths = new Set(prev.map(r => r.repoPath))
      const newEntries: RepoEntry[] = selected
        .filter(r => !existingPaths.has(r.repoPath))
        .map((r, i) => ({
          id: `scan-${Date.now()}-${i}`,
          repoPath: r.repoPath,
          name: r.name,
          isPrimary: false,
          valid: true,
        }))
      return [...prev, ...newEntries]
    })
    setMode('manual')
  }

  // ── VS Code 导入模式 ──
  const handleImportVscode = async () => {
    if (!vscodeFilePath.trim()) { setError('请填写 .code-workspace 文件路径'); return }
    setError('')
    setImportLoading(true)
    setImportResults([])
    try {
      const result = await workspaceAPI.importVscode(vscodeFilePath.trim())
      if (result.success) {
        setImportResults((result.repos || []).map(r => ({ ...r, checked: true })))
      } else {
        setError(result.error || '导入失败')
      }
    } catch (err: unknown) {
      setError(errMsg(err))
    } finally {
      setImportLoading(false)
    }
  }

  const applyImportResults = () => {
    const selected = importResults.filter(r => r.checked)
    if (selected.length === 0) return
    setRepos(prev => {
      const existingPaths = new Set(prev.map(r => r.repoPath))
      const newEntries: RepoEntry[] = selected
        .filter(r => !existingPaths.has(r.repoPath))
        .map((r, i) => ({
          id: `import-${Date.now()}-${i}`,
          repoPath: r.repoPath,
          name: r.name,
          isPrimary: false,
          valid: true,
        }))
      return [...prev, ...newEntries]
    })
    setMode('manual')
  }

  // ── 提交 ──
  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('请填写工作区名称'); return }
    if (repos.length === 0) { setError('至少需要添加一个仓库'); return }
    for (const r of repos) {
      if (!r.repoPath.trim()) { setError('有仓库路径未填写'); return }
    }

    setSaving(true)
    try {
      const reposData = repos.map((r, i) => ({
        id: r.id.startsWith('new-') || r.id.startsWith('scan-') || r.id.startsWith('import-')
          ? undefined
          : r.id,
        repoPath: r.repoPath,
        name: r.name || r.repoPath.split(/[\\/]/).pop() || r.repoPath,
        isPrimary: r.isPrimary,
        sortOrder: i,
      }))

      let result: { success: boolean; error?: string }
      if (isEdit && workspace) {
        result = await workspaceAPI.update(workspace.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          repos: reposData,
        })
      } else {
        result = await workspaceAPI.create({
          name: name.trim(),
          description: description.trim() || undefined,
          repos: reposData,
        })
      }

      if (result.success) {
        onSaved()
      } else {
        setError(result.error || '保存失败')
      }
    } catch (err: unknown) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const MODE_TABS: Array<{ id: CreateMode; label: string; icon: React.ReactNode }> = [
    { id: 'manual', label: '手动添加', icon: <Plus className="w-3.5 h-3.5" /> },
    { id: 'scan',   label: '扫描目录', icon: <FolderSearch className="w-3.5 h-3.5" /> },
    { id: 'vscode', label: '导入 VS Code', icon: <FileCode className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-bg-secondary rounded-xl shadow-2xl w-full max-w-lg border border-border flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-base font-semibold text-text-primary">
            {isEdit ? '编辑工作区' : '新建工作区'}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 名称 & 描述 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">工作区名称 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例：我的项目集"
                className="w-full px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">描述（可选）</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="简单描述这组仓库的用途"
                className="w-full px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {/* 仓库管理区 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary">仓库列表</label>
              <span className="text-xs text-text-muted">
                {repos.length} 个仓库
                {repos.some(r => r.isPrimary)
                  ? `，主仓库：${repos.find(r => r.isPrimary)?.name || ''}`
                  : '，无主仓库'}
              </span>
            </div>

            {/* 模式切换 Tab（仅新建模式显示） */}
            {!isEdit && (
              <div className="flex gap-1 mb-3 p-1 bg-bg-tertiary rounded-lg">
                {MODE_TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setMode(t.id)}
                    className={[
                      'flex items-center gap-1 flex-1 justify-center px-2 py-1.5 rounded text-xs font-medium transition-colors',
                      mode === t.id
                        ? 'bg-bg-secondary text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary',
                    ].join(' ')}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* 手动模式 */}
            {mode === 'manual' && (
              <div className="space-y-2">
                {repos.map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    onSelectDir={() => selectRepoDir(repo.id)}
                    onChangeName={v => updateRepo(repo.id, 'name', v)}
                    onSetPrimary={() => setPrimary(repo.id)}
                    onRemove={() => removeRepo(repo.id)}
                  />
                ))}
                <button
                  onClick={addRepoRow}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-text-muted hover:text-text-primary hover:border-accent-blue transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加仓库
                </button>
              </div>
            )}

            {/* 扫描模式 */}
            {mode === 'scan' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanDir}
                    onChange={e => setScanDir(e.target.value)}
                    placeholder="父目录路径"
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
                  />
                  <button
                    onClick={handleScanDirSelect}
                    className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-accent-blue transition-colors"
                    title="浏览"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleScan}
                    disabled={!scanDir || scanLoading}
                    className="px-3 py-2 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {scanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '扫描'}
                  </button>
                </div>
                {scanResults.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-text-muted">发现 {scanResults.length} 个 Git 仓库，勾选后导入：</p>
                    {scanResults.map((r, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={e => {
                            const next = [...scanResults]
                            next[i] = { ...next[i], checked: e.target.checked }
                            setScanResults(next)
                          }}
                          className="accent-accent-blue"
                        />
                        <span className="text-xs text-text-secondary font-semibold">{r.name}</span>
                        <span className="text-xs text-text-muted font-mono truncate">{r.repoPath}</span>
                      </label>
                    ))}
                    <button
                      onClick={applyScanResults}
                      disabled={!scanResults.some(r => r.checked)}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      导入选中仓库
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* VS Code 导入模式 */}
            {mode === 'vscode' && (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">
                  填写 VS Code 的 <code className="bg-bg-tertiary px-1 rounded">.code-workspace</code> 文件路径，自动解析其中的仓库列表。
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={vscodeFilePath}
                    onChange={e => setVscodeFilePath(e.target.value)}
                    placeholder="例：E:\代码\myproject.code-workspace"
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
                  />
                  <button
                    onClick={handleImportVscode}
                    disabled={importLoading || !vscodeFilePath.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {importLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <FileCode className="w-4 h-4" />}
                    解析
                  </button>
                </div>
                {importResults.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-text-muted">解析到 {importResults.length} 个仓库：</p>
                    {importResults.map((r, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={e => {
                            const next = [...importResults]
                            next[i] = { ...next[i], checked: e.target.checked }
                            setImportResults(next)
                          }}
                          className="accent-accent-blue"
                        />
                        <span className="text-xs text-text-secondary font-semibold">{r.name}</span>
                        <span className="text-xs text-text-muted font-mono truncate">{r.repoPath}</span>
                      </label>
                    ))}
                    <button
                      onClick={applyImportResults}
                      disabled={!importResults.some(r => r.checked)}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      导入选中仓库
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent-red/10 text-accent-red text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Check className="w-4 h-4" />}
            {isEdit ? '保存更改' : '创建工作区'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 单条仓库行（手动模式） ──

function RepoRow({
  repo, onSelectDir, onChangeName, onSetPrimary, onRemove,
}: {
  repo: RepoEntry
  onSelectDir: () => void
  onChangeName: (v: string) => void
  onSetPrimary: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-bg-tertiary">
      {/* Primary 切换 */}
      <button
        onClick={onSetPrimary}
        className={[
          'flex-shrink-0 transition-colors',
          repo.isPrimary ? 'text-accent-yellow' : 'text-text-muted hover:text-accent-yellow',
        ].join(' ')}
        title={repo.isPrimary ? '取消主仓库' : '设为主仓库'}
      >
        {repo.isPrimary
          ? <Star className="w-3.5 h-3.5 fill-current" />
          : <StarOff className="w-3.5 h-3.5" />}
      </button>

      {/* 路径选择 */}
      <button
        onClick={onSelectDir}
        className="flex-1 min-w-0 text-left"
      >
        <div className={[
          'flex items-center gap-1.5 text-xs font-mono truncate px-2 py-1 rounded',
          repo.repoPath
            ? repo.valid === false
              ? 'text-accent-red bg-accent-red/10'
              : repo.checking
                ? 'text-text-muted'
                : repo.valid
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
            : 'text-text-muted hover:text-text-primary',
        ].join(' ')}>
          {repo.checking && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
          {!repo.checking && repo.valid && repo.repoPath && <Check className="w-3 h-3 text-accent-green flex-shrink-0" />}
          {!repo.checking && repo.valid === false && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
          <span className="truncate">{repo.repoPath || '点击选择仓库目录…'}</span>
        </div>
      </button>

      {/* 显示名 */}
      <input
        type="text"
        value={repo.name}
        onChange={e => onChangeName(e.target.value)}
        placeholder="名称"
        className="w-24 px-2 py-1 text-xs rounded bg-bg-secondary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
      />

      {/* 删除 */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 text-text-muted hover:text-accent-red transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
