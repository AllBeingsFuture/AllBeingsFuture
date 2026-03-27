import { useState } from 'react'
import {
  Plus, Trash2, FolderSearch, FileCode, Star, StarOff,
  Loader2, Check, AlertCircle, FolderOpen,
} from 'lucide-react'
import type { Workspace } from '../../types/workspaceTypes'

// ── IPC helpers (shared with WorkspaceTab) ──

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Re-import ipc to keep this module self-contained
import { ipc } from '../../../bindings/electron-api'

const workspaceAPI = {
  create: (data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipc('WorkspaceService.Create', data).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  update: (id: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipc('WorkspaceService.Update', id, data).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  scanRepos: (dir: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> =>
    ipc('WorkspaceService.ScanRepos', dir).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  importVscode: (filePath: string): Promise<{ success: boolean; repos?: Array<{ repoPath: string; name: string }>; error?: string }> =>
    ipc('WorkspaceService.ImportVscode', filePath).catch((e: unknown) => ({ success: false, error: errMsg(e) })),
  isGitRepo: (dir: string): Promise<boolean> =>
    ipc('WorkspaceService.IsGitRepo', dir).catch(() => false),
  selectDirectory: (): Promise<string | null> =>
    ipc('app:selectDirectory').catch(() => null),
}

// ── Types ──

type CreateMode = 'manual' | 'scan' | 'vscode'

interface RepoEntry {
  id: string
  repoPath: string
  name: string
  isPrimary: boolean
  valid?: boolean
  checking?: boolean
}

// ── Repo Row ──

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
      <button
        onClick={onSetPrimary}
        className={[
          'flex-shrink-0 transition-colors',
          repo.isPrimary ? 'text-accent-yellow' : 'text-text-muted hover:text-accent-yellow',
        ].join(' ')}
        title={repo.isPrimary ? '\u53D6\u6D88\u4E3B\u4ED3\u5E93' : '\u8BBE\u4E3A\u4E3B\u4ED3\u5E93'}
      >
        {repo.isPrimary
          ? <Star className="w-3.5 h-3.5 fill-current" />
          : <StarOff className="w-3.5 h-3.5" />}
      </button>

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
          <span className="truncate">{repo.repoPath || '\u70B9\u51FB\u9009\u62E9\u4ED3\u5E93\u76EE\u5F55\u2026'}</span>
        </div>
      </button>

      <input
        type="text"
        value={repo.name}
        onChange={e => onChangeName(e.target.value)}
        placeholder="\u540D\u79F0"
        className="w-24 px-2 py-1 text-xs rounded bg-bg-secondary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
      />

      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 text-text-muted hover:text-accent-red transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Main Modal ──

export default function WorkspaceEditModal({
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

  const [scanDir, setScanDir] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanResults, setScanResults] = useState<Array<{ repoPath: string; name: string; checked: boolean }>>([])

  const [vscodeFilePath, setVscodeFilePath] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResults, setImportResults] = useState<Array<{ repoPath: string; name: string; checked: boolean }>>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    const valid = await workspaceAPI.isGitRepo(dir)
    setRepos(prev => prev.map(r => r.id === id ? { ...r, valid, checking: false } : r))
  }

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
        setError(result.error || '\u626B\u63CF\u5931\u8D25')
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

  const handleImportVscode = async () => {
    if (!vscodeFilePath.trim()) { setError('\u8BF7\u586B\u5199 .code-workspace \u6587\u4EF6\u8DEF\u5F84'); return }
    setError('')
    setImportLoading(true)
    setImportResults([])
    try {
      const result = await workspaceAPI.importVscode(vscodeFilePath.trim())
      if (result.success) {
        setImportResults((result.repos || []).map(r => ({ ...r, checked: true })))
      } else {
        setError(result.error || '\u5BFC\u5165\u5931\u8D25')
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

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('\u8BF7\u586B\u5199\u5DE5\u4F5C\u533A\u540D\u79F0'); return }
    if (repos.length === 0) { setError('\u81F3\u5C11\u9700\u8981\u6DFB\u52A0\u4E00\u4E2A\u4ED3\u5E93'); return }
    for (const r of repos) {
      if (!r.repoPath.trim()) { setError('\u6709\u4ED3\u5E93\u8DEF\u5F84\u672A\u586B\u5199'); return }
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
        setError(result.error || '\u4FDD\u5B58\u5931\u8D25')
      }
    } catch (err: unknown) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const MODE_TABS: Array<{ id: CreateMode; label: string; icon: React.ReactNode }> = [
    { id: 'manual', label: '\u624B\u52A8\u6DFB\u52A0', icon: <Plus className="w-3.5 h-3.5" /> },
    { id: 'scan',   label: '\u626B\u63CF\u76EE\u5F55', icon: <FolderSearch className="w-3.5 h-3.5" /> },
    { id: 'vscode', label: '\u5BFC\u5165 VS Code', icon: <FileCode className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-bg-secondary rounded-xl shadow-2xl w-full max-w-lg border border-border flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-base font-semibold text-text-primary">
            {isEdit ? '\u7F16\u8F91\u5DE5\u4F5C\u533A' : '\u65B0\u5EFA\u5DE5\u4F5C\u533A'}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name & description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">{'\u5DE5\u4F5C\u533A\u540D\u79F0'} *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={'\u4F8B\uFF1A\u6211\u7684\u9879\u76EE\u96C6'}
                className="w-full px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">{'\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09'}</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={'\u7B80\u5355\u63CF\u8FF0\u8FD9\u7EC4\u4ED3\u5E93\u7684\u7528\u9014'}
                className="w-full px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {/* Repo management */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary">{'\u4ED3\u5E93\u5217\u8868'}</label>
              <span className="text-xs text-text-muted">
                {repos.length} {'\u4E2A\u4ED3\u5E93'}
                {repos.some(r => r.isPrimary)
                  ? `\uFF0C\u4E3B\u4ED3\u5E93\uFF1A${repos.find(r => r.isPrimary)?.name || ''}`
                  : '\uFF0C\u65E0\u4E3B\u4ED3\u5E93'}
              </span>
            </div>

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

            {/* Manual mode */}
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
                  {'\u6DFB\u52A0\u4ED3\u5E93'}
                </button>
              </div>
            )}

            {/* Scan mode */}
            {mode === 'scan' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanDir}
                    onChange={e => setScanDir(e.target.value)}
                    placeholder={'\u7236\u76EE\u5F55\u8DEF\u5F84'}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue"
                  />
                  <button
                    onClick={handleScanDirSelect}
                    className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-accent-blue transition-colors"
                    title={'\u6D4F\u89C8'}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleScan}
                    disabled={!scanDir || scanLoading}
                    className="px-3 py-2 rounded-lg bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {scanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '\u626B\u63CF'}
                  </button>
                </div>
                {scanResults.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-text-muted">{'\u53D1\u73B0'} {scanResults.length} {'\u4E2A Git \u4ED3\u5E93\uFF0C\u52FE\u9009\u540E\u5BFC\u5165\uFF1A'}</p>
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
                      {'\u5BFC\u5165\u9009\u4E2D\u4ED3\u5E93'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* VS Code import mode */}
            {mode === 'vscode' && (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">
                  {'\u586B\u5199 VS Code \u7684'} <code className="bg-bg-tertiary px-1 rounded">.code-workspace</code> {'\u6587\u4EF6\u8DEF\u5F84\uFF0C\u81EA\u52A8\u89E3\u6790\u5176\u4E2D\u7684\u4ED3\u5E93\u5217\u8868\u3002'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={vscodeFilePath}
                    onChange={e => setVscodeFilePath(e.target.value)}
                    placeholder={'E:\\\u4EE3\u7801\\myproject.code-workspace'}
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
                    {'\u89E3\u6790'}
                  </button>
                </div>
                {importResults.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-text-muted">{'\u89E3\u6790\u5230'} {importResults.length} {'\u4E2A\u4ED3\u5E93\uFF1A'}</p>
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
                      {'\u5BFC\u5165\u9009\u4E2D\u4ED3\u5E93'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent-red/10 text-accent-red text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            {'\u53D6\u6D88'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Check className="w-4 h-4" />}
            {isEdit ? '\u4FDD\u5B58\u66F4\u6539' : '\u521B\u5EFA\u5DE5\u4F5C\u533A'}
          </button>
        </div>
      </div>
    </div>
  )
}
