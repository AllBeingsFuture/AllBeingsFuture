import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, MessageSquarePlus, Zap, Shield, Cpu, Star, X, ChevronDown, ChevronUp, GitBranch, Layers } from 'lucide-react'
import { GitService } from '../../../bindings/allbeingsfuture/internal/services'
import { ipc } from '../../../bindings/electron-api'
import { workbenchApi } from '../../app/api/workbench'
import { useSettingsStore } from '../../stores/settingsStore'
import DraggableDialog from '../common/DraggableDialog'
import type { AIProvider, SessionConfig } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { Workspace } from '../../types/workspaceTypes'

interface Props {
  onClose: () => void
}

// ─── 常用目录（localStorage 持久化） ───

interface RecentDir {
  path: string
  isPinned: boolean
  lastUsedAt: string
}

const RECENT_DIRS_KEY = 'allbeingsfuture-recent-directories'
const LAST_WORKDIR_KEY = 'allbeingsfuture-last-workdir'
const LAST_WORKSPACE_KEY = 'allbeingsfuture-last-workspace-id'
const PROVIDER_CHECK_CACHE_TTL_MS = 30_000
const WORKDIR_CHECK_DEBOUNCE_MS = 120

const providerAvailabilityCache = new Map<string, {
  expiresAt: number
  promise?: Promise<boolean>
  result?: boolean
}>()
const repoRootCache = new Map<string, string>()

function loadRecentDirs(): RecentDir[] {
  try {
    const raw = localStorage.getItem(RECENT_DIRS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecentDirs(dirs: RecentDir[]) {
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs))
}

function addRecentDir(path: string, pin = false): RecentDir[] {
  const dirs = loadRecentDirs()
  const existing = dirs.find(d => d.path === path)
  if (existing) {
    existing.lastUsedAt = new Date().toISOString()
    if (pin) existing.isPinned = true
  } else {
    dirs.push({ path, isPinned: pin, lastUsedAt: new Date().toISOString() })
  }
  saveRecentDirs(dirs)
  return dirs
}

function shortDirName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/')
}

function loadLastWorkDir(): string {
  try {
    return localStorage.getItem(LAST_WORKDIR_KEY) || ''
  } catch {
    return ''
  }
}

function saveLastWorkDir(path: string) {
  try {
    if (path) localStorage.setItem(LAST_WORKDIR_KEY, path)
  } catch { /* ignore */ }
}

function loadLastWorkspaceId(): string {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY) || ''
  } catch {
    return ''
  }
}

function saveLastWorkspaceId(id: string) {
  try {
    if (id) localStorage.setItem(LAST_WORKSPACE_KEY, id)
    else localStorage.removeItem(LAST_WORKSPACE_KEY)
  } catch { /* ignore */ }
}

function resolveWorkspacePrimaryPath(workspace: Workspace): string {
  const primary = workspace.repos.find(repo => repo.isPrimary) || workspace.repos[0]
  return (primary?.repoPath || workspace.rootPath || '').trim()
}

function resolveDefaultWorkDir(recentDirs: RecentDir[], workspaces: Workspace[]): {
  workDir: string
  workspaceId: string
} {
  const lastWorkspaceId = loadLastWorkspaceId()
  if (lastWorkspaceId) {
    const matched = workspaces.find(ws => ws.id === lastWorkspaceId)
    const path = matched ? resolveWorkspacePrimaryPath(matched) : ''
    if (path) return { workDir: path, workspaceId: matched!.id }
  }

  const lastWorkDir = loadLastWorkDir()
  if (lastWorkDir) return { workDir: lastWorkDir, workspaceId: '' }

  const pinned = recentDirs.filter(d => d.isPinned).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
  if (pinned[0]?.path) return { workDir: pinned[0].path, workspaceId: '' }

  const sorted = [...recentDirs].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
  if (sorted[0]?.path) return { workDir: sorted[0].path, workspaceId: '' }

  if (workspaces[0]) {
    const path = resolveWorkspacePrimaryPath(workspaces[0])
    if (path) return { workDir: path, workspaceId: workspaces[0].id }
  }

  return { workDir: '', workspaceId: '' }
}

function getProviderCacheKey(provider: Pick<AIProvider, 'id' | 'command' | 'executablePath'>): string {
  return `${provider.id}::${provider.executablePath || provider.command || ''}`
}

async function isProviderRunnable(provider: AIProvider): Promise<boolean> {
  if (provider.adapterType === 'openai-api') {
    return true
  }

  const cacheKey = getProviderCacheKey(provider)
  const now = Date.now()
  const cached = providerAvailabilityCache.get(cacheKey)
  if (cached) {
    if (cached.result !== undefined && cached.expiresAt > now) {
      return cached.result
    }
    if (cached.promise) {
      return cached.promise
    }
  }

  const promise = workbenchApi.provider.testExecutable(
    provider.id,
    provider.executablePath || provider.command,
  )
    .then(Boolean)
    .catch(() => false)

  providerAvailabilityCache.set(cacheKey, {
    expiresAt: now + PROVIDER_CHECK_CACHE_TTL_MS,
    promise,
  })

  const result = await promise
  providerAvailabilityCache.set(cacheKey, {
    expiresAt: Date.now() + PROVIDER_CHECK_CACHE_TTL_MS,
    result,
  })

  return result
}

// ─── Providers ───

const providerMetaByAdapter: Record<string, { icon: string; desc: string }> = {
  'openai-api': { icon: '🟩', desc: 'OpenAI 兼容中转与多模型接入（非 Agent）' },
  iflow: { icon: '🟡', desc: 'ACP v1 / stdio' },
  acp: { icon: '⬡', desc: 'ACP v1 / stdio' },
  'acp-stdio': { icon: '⬡', desc: 'ACP v1 / stdio' },
}

const providerMetaById: Record<string, { icon: string; desc: string }> = {
  'claude-code': { icon: '🟣', desc: 'Claude Code · ACP v1' },
  codex: { icon: '🟢', desc: 'Codex CLI · ACP v1' },
  'gemini-cli': { icon: '🔵', desc: 'Gemini CLI · ACP v1' },
  opencode: { icon: '🟠', desc: 'OpenCode · ACP v1' },
  'grok-build': { icon: '🟡', desc: 'Grok Build · ACP v1' },
  'qwen-code': { icon: '🔷', desc: 'Qwen Code · ACP v1' },
  'kimi-cli': { icon: '💠', desc: 'Kimi CLI · ACP v1' },
  'github-copilot': { icon: '🟩', desc: 'GitHub Copilot · ACP v1' },
}

function resolveProviderMeta(provider: Pick<AIProvider, 'adapterType' | 'id'>): { icon: string; desc: string } {
  if (provider.id && providerMetaById[provider.id]) {
    return providerMetaById[provider.id]
  }
  return providerMetaByAdapter[provider.adapterType || ''] || { icon: '🤖', desc: '自定义 Provider' }
}

const modes: { id: string; label: string; desc: string; icon: typeof Zap }[] = [
  { id: 'normal', label: '普通会话', desc: '标准 AI 编码助手', icon: Zap },
  { id: 'supervisor', label: 'Supervisor', desc: '可创建子 Agent 协作', icon: Shield },
  { id: 'mission', label: '自主任务', desc: '自动创建团队完成目标', icon: Cpu },
]

// ─── Component ───

export default function SessionCreator({ onClose }: Props) {
  const autoWorktree = useSettingsStore(s => s.settings.autoWorktree)

  const [name, setName] = useState(() => `会话 ${new Date().toLocaleTimeString('zh-CN')}`)
  const [workDir, setWorkDir] = useState('')
  const [providerId, setProviderId] = useState('claude-code')
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [mode, setMode] = useState<string>('normal')
  const [prompt, setPrompt] = useState('')
  const autoAccept = true
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [worktreeState, setWorktreeState] = useState<'idle' | 'git' | 'plain'>('idle')
  /** 创建时立即进入 worktree；默认 false 保持「先在主目录启动」 */
  const [isolateOnCreate, setIsolateOnCreate] = useState(false)

  // 常用目录 / 工作区
  const [recentDirs, setRecentDirs] = useState<RecentDir[]>([])
  const [showAllDirs, setShowAllDirs] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [defaultsReady, setDefaultsReady] = useState(false)

  useEffect(() => {
    const dirs = loadRecentDirs()
    setRecentDirs(dirs)

    // 同步先用最近目录填默认路径，避免空白等待
    const syncDefaults = resolveDefaultWorkDir(dirs, [])
    if (syncDefaults.workDir) {
      setWorkDir(syncDefaults.workDir)
    }

    let cancelled = false
    void ipc('WorkspaceService.List')
      .then((list: Workspace[] | null) => {
        if (cancelled) return
        const workspacesList = list || []
        setWorkspaces(workspacesList)
        // 仅在用户尚未手动改路径时，用工作区/最近路径补默认值
        setWorkDir((current) => {
          if (current.trim()) return current
          return resolveDefaultWorkDir(dirs, workspacesList).workDir
        })
        setSelectedWorkspaceId((current) => {
          if (current) return current
          return resolveDefaultWorkDir(dirs, workspacesList).workspaceId
        })
        setDefaultsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setWorkspaces([])
        setDefaultsReady(true)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadProviders = async () => {
      try {
        const data = await workbenchApi.provider.list()
        if (cancelled) return

        const enabledProviders = (data || []).filter(provider => provider.isEnabled)
        const runnableProviders = (
          await Promise.all(enabledProviders.map(async (provider) => (
            await isProviderRunnable(provider) ? provider : null
          )))
        ).filter((provider): provider is AIProvider => !!provider)

        if (cancelled) return
        setProviders(runnableProviders)
        setProviderId((current) => (
          runnableProviders.some((provider) => provider.id === current)
            ? current
            : runnableProviders[0]?.id || ''
        ))
      } catch (error) {
        console.error('Failed to load providers:', error)
      }
    }

    void loadProviders()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const targetDir = workDir.trim()

    if (!targetDir || !autoWorktree) {
      setWorktreeState('idle')
      return () => {
        cancelled = true
      }
    }

    if (repoRootCache.has(targetDir)) {
      setWorktreeState((repoRootCache.get(targetDir) || '') ? 'git' : 'plain')
      return () => {
        cancelled = true
      }
    }

    setWorktreeState('idle')
    const timer = window.setTimeout(() => {
      void GitService.GetRepoRoot(targetDir)
        .then((repoPath) => {
          const resolvedRepoPath = repoPath || ''
          repoRootCache.set(targetDir, resolvedRepoPath)
          if (!cancelled) {
            setWorktreeState(resolvedRepoPath ? 'git' : 'plain')
          }
        })
        .catch(() => {
          repoRootCache.set(targetDir, '')
          if (!cancelled) {
            setWorktreeState('plain')
          }
        })
    }, WORKDIR_CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [autoWorktree, workDir])

  const pinnedDirs = useMemo(() =>
    recentDirs.filter(d => d.isPinned).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)),
    [recentDirs],
  )
  const unpinnedDirs = useMemo(() =>
    recentDirs.filter(d => !d.isPinned).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)),
    [recentDirs],
  )
  const visibleDirs = showAllDirs ? [...pinnedDirs, ...unpinnedDirs] : pinnedDirs
  const providerCards = useMemo(() => (
    providers.map(provider => ({
      ...provider,
      ...resolveProviderMeta(provider),
    }))
  ), [providers])

  const handleTogglePin = (path: string) => {
    const dirs = loadRecentDirs()
    const dir = dirs.find(d => d.path === path)
    if (dir) {
      dir.isPinned = !dir.isPinned
      saveRecentDirs(dirs)
      setRecentDirs([...dirs])
    }
  }

  const handleRemoveDir = (path: string) => {
    const dirs = loadRecentDirs().filter(d => d.path !== path)
    saveRecentDirs(dirs)
    setRecentDirs(dirs)
  }

  const handleAddDir = async () => {
    try {
      const dir = await workbenchApi.app.selectDirectory()
      if (dir) {
        const updated = addRecentDir(dir, true)
        setRecentDirs(updated)
        setWorkDir(dir)
      }
    } catch (e) {
      console.error('OpenFile dialog error:', e)
    }
  }

  const handleSelectDir = (path: string) => {
    setWorkDir(path)
    setSelectedWorkspaceId('')
    // Update lastUsedAt
    const dirs = loadRecentDirs()
    const dir = dirs.find(d => d.path === path)
    if (dir) {
      dir.lastUsedAt = new Date().toISOString()
      saveRecentDirs(dirs)
    }
  }

  const handleSelectWorkspace = (workspaceId: string) => {
    if (!workspaceId) {
      setSelectedWorkspaceId('')
      return
    }
    const workspace = workspaces.find(ws => ws.id === workspaceId)
    if (!workspace) return
    const path = resolveWorkspacePrimaryPath(workspace)
    setSelectedWorkspaceId(workspaceId)
    if (path) setWorkDir(path)
  }

  const handleBrowse = async () => {
    try {
      const dir = await workbenchApi.app.selectDirectory()
      if (dir) {
        setWorkDir(dir)
        setSelectedWorkspaceId('')
        const updated = addRecentDir(dir)
        setRecentDirs(updated)
      }
    } catch (e) {
      console.error('OpenFile dialog error:', e)
    }
  }

  const handleCreate = async () => {
    if (!workDir) {
      setError('请选择工作区或填写工作目录')
      return
    }
    setError('')
    setCreating(true)
    try {
      const trimmedWorkDir = workDir.trim()
      // 始终解析 git 根，便于会话后续一键进入 worktree
      const gitRepoPath = (
        repoRootCache.has(trimmedWorkDir)
          ? repoRootCache.get(trimmedWorkDir) || ''
          : await GitService.GetRepoRoot(trimmedWorkDir).catch(() => '')
      ) || ''
      repoRootCache.set(trimmedWorkDir, gitRepoPath)

      const shouldIsolate = Boolean(autoWorktree && isolateOnCreate && gitRepoPath)

      const config = {
        name,
        workingDirectory: trimmedWorkDir,
        providerId,
        mode: mode as any,
        initialPrompt: prompt,
        autoAccept,
        worktreeEnabled: shouldIsolate,
        gitRepoPath,
        gitBranch: '',
      } as SessionConfig
      const session = await workbenchApi.session.create(config)
      if (session) {
        saveLastWorkDir(trimmedWorkDir)
        saveLastWorkspaceId(selectedWorkspaceId)
        addRecentDir(trimmedWorkDir)
        // Init may fail transiently — still select the session so
        // ConversationView can retry on mount. sendMessage also auto-inits.
        try { await workbenchApi.session.init(session.id) } catch {}
        await workbenchApi.navigation.openSession(session.id)
        if (prompt.trim()) {
          await workbenchApi.chat.appendMessage(session.id, prompt.trim())
        }
      }
      onClose()
    } catch (err: any) {
      setError(err?.message || String(err) || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DraggableDialog
      title="新建会话"
      icon={<MessageSquarePlus size={16} />}
      widthClass="w-[560px]"
      heightClass="max-h-[85vh]"
      onClose={onClose}
      testId="session-creator"
    >
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* ── 1. 会话名称 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">会话名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-400/60"
          />
        </div>

        {/* ── 2. 工作区（优先，免手填路径） ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Layers size={12} />
              工作区
            </span>
          </label>
          {workspaces.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {workspaces.map(ws => {
                const primaryPath = resolveWorkspacePrimaryPath(ws)
                const selected = selectedWorkspaceId === ws.id
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleSelectWorkspace(ws.id)}
                    title={primaryPath || ws.name}
                    className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      selected
                        ? 'border-blue-400/40 bg-blue-500/15 text-blue-200'
                        : 'border-white/10 text-gray-300 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="truncate font-medium">{ws.name}</div>
                    {primaryPath && (
                      <div className="mt-0.5 max-w-[180px] truncate text-[10px] text-gray-500">
                        {shortDirName(primaryPath)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] text-gray-600">
              尚未配置工作区。可在「设置 → 工作区」添加项目，或下方直接选目录。
            </p>
          )}
        </div>

        {/* ── 3. 工作目录 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            工作目录 <span className="text-red-400">*</span>
            {defaultsReady && workDir && (
              <span className="ml-2 font-normal text-gray-600">已自动填入上次/默认路径</span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              value={workDir}
              onChange={e => {
                setWorkDir(e.target.value)
                setSelectedWorkspaceId('')
              }}
              placeholder="选择工作区，或输入/浏览目录"
              className={`flex-1 px-3 py-2 bg-slate-900 border rounded-lg text-sm text-white outline-none focus:border-blue-400/60 ${error && !workDir ? 'border-red-500/60' : 'border-white/10'}`}
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="浏览目录"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>

        {/* ── 4. 常用目录 ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-400">常用目录</label>
            <button
              onClick={handleAddDir}
              className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              + 添加
            </button>
          </div>

          {visibleDirs.length > 0 ? (
            <div className="max-h-[120px] overflow-y-auto space-y-1">
              {visibleDirs.map(dir => (
                <div
                  key={dir.path}
                  onClick={() => handleSelectDir(dir.path)}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                    workDir === dir.path && !selectedWorkspaceId
                      ? 'bg-blue-500/15 border border-blue-400/40 text-blue-300'
                      : 'border border-transparent hover:bg-white/5 text-gray-300 hover:text-white'
                  }`}
                >
                  <FolderOpen size={12} className="shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{shortDirName(dir.path)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleTogglePin(dir.path) }}
                    className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                      dir.isPinned ? 'opacity-100 text-yellow-400' : 'text-gray-500 hover:text-yellow-400'
                    }`}
                  >
                    <Star size={12} className={dir.isPinned ? 'fill-current' : ''} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleRemoveDir(dir.path) }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-600 py-1">点击「+ 添加」收藏常用项目目录</p>
          )}

          {unpinnedDirs.length > 0 && (
            <button
              onClick={() => setShowAllDirs(v => !v)}
              className="flex items-center gap-1 mt-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showAllDirs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAllDirs ? '收起' : `展开更多 ${unpinnedDirs.length} 个`}
            </button>
          )}
        </div>

        {/* ── 5. Worktree 隔离策略 ── */}
        {autoWorktree && worktreeState === 'git' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <GitBranch size={12} className="text-emerald-400" />
              Git Worktree 隔离
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsolateOnCreate(false)}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  !isolateOnCreate
                    ? 'border-emerald-400/40 bg-emerald-500/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <div className="text-[11px] font-medium text-white">改代码时再隔离</div>
                <div className="mt-0.5 text-[10px] text-gray-500">先在主目录启动，会话内可一键进入 worktree</div>
              </button>
              <button
                type="button"
                onClick={() => setIsolateOnCreate(true)}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  isolateOnCreate
                    ? 'border-emerald-400/40 bg-emerald-500/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <div className="text-[11px] font-medium text-white">创建时立即隔离</div>
                <div className="mt-0.5 text-[10px] text-gray-500">直接在独立 worktree 中启动会话</div>
              </button>
            </div>
          </div>
        )}

        {/* ── 6. 初始指令 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">初始指令（可选）</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="创建后自动发送的指令..."
            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-400/60 resize-none"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            {autoWorktree
              ? (
                  worktreeState === 'git'
                    ? (isolateOnCreate
                        ? '将创建独立 worktree 并在其中启动会话；完成后可在工具栏合并回主分支。'
                        : '当前目录属于 Git 仓库。会话会先在主目录启动；需要改代码时，可在会话工具栏一键进入 Worktree，或由 Agent 按规则进入。')
                    : worktreeState === 'plain'
                      ? '当前目录不是 Git 仓库。会话将直接在该目录启动；如果后续需要改代码，建议选择 Git 仓库或工作区。'
                      : '已开启 Git worktree 规则。选择 Git 仓库或工作区后，可选择立即隔离或延迟隔离。'
                )
              : '已关闭 Git worktree 规则。新会话会直接使用当前目录；如果你要做代码修改，建议在设置中重新开启。'}
          </p>
        </div>

        {/* ── 7. AI 提供者 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">AI 提供者</label>
          {providerCards.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {providerCards.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProviderId(p.id)}
                  className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                    providerId === p.id
                      ? 'border-blue-400/40 bg-blue-500/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.icon}</span>
                    <span className="text-xs font-medium text-white">{p.name}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5 ml-6">{p.desc}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-gray-500">
              没有可用 Provider，请先到设置里启用或创建 Provider。
            </div>
          )}
        </div>

        {/* ── 8. 会话模式 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">会话模式</label>
          <div className="flex gap-2">
            {modes.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex-1 px-2.5 py-2 rounded-lg border text-center transition-colors ${
                  mode === m.id
                    ? 'border-blue-400/40 bg-blue-500/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <m.icon size={14} className="mx-auto mb-0.5 text-slate-300" />
                <div className="text-[11px] font-medium text-white">{m.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg transition-colors">
          取消
        </button>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-6 py-2.5 text-sm font-medium bg-blue-500 text-white rounded-xl hover:bg-blue-400 disabled:opacity-40 transition-colors shadow-lg shadow-blue-500/20"
        >
          {creating ? '创建中...' : '创建'}
        </button>
      </div>
    </DraggableDialog>
  )
}
