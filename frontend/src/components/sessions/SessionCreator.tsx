import { useState, useEffect, useMemo } from 'react'
import { FolderOpen, MessageSquarePlus, Zap, Shield, Cpu, Star, X, ChevronDown, ChevronUp } from 'lucide-react'
import { AppAPI } from '../../../bindings/electron-api'
import { ProviderService } from '../../../bindings/allbeingsfuture/internal/services'
import { useSessionStore } from '../../stores/sessionStore'
import DraggableDialog from '../common/DraggableDialog'
import type { AIProvider, SessionConfig } from '../../../bindings/allbeingsfuture/internal/models/models'

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

// ─── Providers ───

const providerMetaByAdapter: Record<string, { icon: string; desc: string }> = {
  'claude-sdk': { icon: '🟣', desc: '综合推理能力最强' },
  'codex-appserver': { icon: '🟢', desc: '代码生成专长' },
  'gemini-headless': { icon: '🔵', desc: '大上下文窗口' },
  'opencode-sdk': { icon: '🟠', desc: '多模型切换' },
  'openai-api': { icon: '🟩', desc: 'OpenAI 兼容中转与多模型接入' },
  iflow: { icon: '🟡', desc: 'ACP 协议适配' },
}

function resolveProviderMeta(provider: Pick<AIProvider, 'adapterType'>): { icon: string; desc: string } {
  return providerMetaByAdapter[provider.adapterType || ''] || { icon: '🤖', desc: '自定义 Provider' }
}

const modes: { id: string; label: string; desc: string; icon: typeof Zap }[] = [
  { id: 'normal', label: '普通会话', desc: '标准 AI 编码助手', icon: Zap },
  { id: 'supervisor', label: 'Supervisor', desc: '可创建子 Agent 协作', icon: Shield },
  { id: 'mission', label: '自主任务', desc: '自动创建团队完成目标', icon: Cpu },
]

// ─── Component ───

export default function SessionCreator({ onClose }: Props) {
  const create = useSessionStore(s => s.create)
  const initProcess = useSessionStore(s => s.initProcess)
  const sendMessage = useSessionStore(s => s.sendMessage)
  const selectSession = useSessionStore(s => s.select)

  const [name, setName] = useState(() => `会话 ${new Date().toLocaleTimeString('zh-CN')}`)
  const [workDir, setWorkDir] = useState('')
  const [providerId, setProviderId] = useState('claude-code')
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [mode, setMode] = useState<string>('normal')
  const [subAgentProviderIds, setSubAgentProviderIds] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const autoAccept = true
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  // 常用目录
  const [recentDirs, setRecentDirs] = useState<RecentDir[]>([])
  const [showAllDirs, setShowAllDirs] = useState(false)

  useEffect(() => {
    setRecentDirs(loadRecentDirs())
  }, [])

  useEffect(() => {
    let cancelled = false
    ProviderService.GetAll()
      .then(data => {
        if (cancelled) return
        const enabledProviders = (data || []).filter(provider => provider.isEnabled)
        setProviders(enabledProviders)
        if (enabledProviders.length > 0 && !enabledProviders.some(provider => provider.id === providerId)) {
          setProviderId(enabledProviders[0].id)
        }
      })
      .catch(error => {
        console.error('Failed to load providers:', error)
      })
    return () => { cancelled = true }
  }, [providerId])

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
      const dir = await AppAPI.selectDirectory()
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
    // Update lastUsedAt
    const dirs = loadRecentDirs()
    const dir = dirs.find(d => d.path === path)
    if (dir) {
      dir.lastUsedAt = new Date().toISOString()
      saveRecentDirs(dirs)
    }
  }

  const handleBrowse = async () => {
    try {
      const dir = await AppAPI.selectDirectory()
      if (dir) {
        setWorkDir(dir)
        const updated = addRecentDir(dir)
        setRecentDirs(updated)
      }
    } catch (e) {
      console.error('OpenFile dialog error:', e)
    }
  }

  const handleCreate = async () => {
    if (!workDir) {
      setError('请填写工作目录')
      return
    }
    setError('')
    setCreating(true)
    try {
      const config = {
        name,
        workingDirectory: workDir,
        providerId,
        mode: mode as any,
        initialPrompt: prompt,
        autoAccept,
        worktreeEnabled: false,
        gitRepoPath: '',
        gitBranch: '',
      } as SessionConfig
      const session = await create(config)
      if (session) {
        // Init may fail transiently — still select the session so
        // ConversationView can retry on mount. sendMessage also auto-inits.
        try { await initProcess(session.id) } catch {}
        selectSession(session.id)
        if (prompt.trim()) {
          await sendMessage(session.id, prompt.trim())
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
            className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-400/60"
          />
        </div>

        {/* ── 2. 工作目录 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">工作目录 <span className="text-red-400">*</span></label>
          <div className="flex gap-2">
            <input
              value={workDir}
              onChange={e => setWorkDir(e.target.value)}
              placeholder="C:\Users\project"
              className={`flex-1 px-3 py-2 bg-slate-900/60 border rounded-lg text-sm text-white outline-none focus:border-blue-400/60 ${error && !workDir ? 'border-red-500/60' : 'border-white/10'}`}
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>

        {/* ── 3. 常用目录 ── */}
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
                    workDir === dir.path
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

        {/* ── 4. 初始指令 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">初始指令（可选）</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="创建后自动发送的指令..."
            className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-400/60 resize-none"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Git Worktree 隔离按 ABF Git Workflow 执行。新建会话不会自动创建 worktree；
            真正涉及代码修改时，模型会先通过 `enter_worktree` 进入隔离目录，再进行写入。
          </p>
        </div>

        {/* ── 5. AI 提供者 ── */}
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
            <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-gray-500">
              没有可用 Provider，请先到设置里启用或创建 Provider。
            </div>
          )}
        </div>

        {/* ── 6. 会话模式 ── */}
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
