import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, GitBranch, GitMerge, FileText, FilePlus, FileEdit, FileX, ChevronDown, ChevronRight, RefreshCw, ArrowUpLeft } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { Session } from '../../../bindings/allbeingsfuture/internal/models/models'
import { workbenchApi } from '../../app/api/workbench'
import { useGitStore } from '../../stores/gitStore'
import { useTrackerStore } from '../../stores/trackerStore'
import { useSessionStore } from '../../stores/sessionStore'

interface Props {
  session: Session
}

const statusMeta: Record<string, { color: string; label: string }> = {
  starting: { color: 'bg-amber-400', label: '启动中' },
  running: { color: 'bg-blue-400', label: '运行中' },
  idle: { color: 'bg-emerald-400', label: '就绪' },
  waiting_input: { color: 'bg-yellow-400', label: '等待输入' },
  completed: { color: 'bg-gray-500', label: '已完成' },
  error: { color: 'bg-red-400', label: '错误' },
  terminated: { color: 'bg-gray-600', label: '已终止' },
}

const modeLabel: Record<string, string> = {
  normal: 'Normal',
  supervisor: 'Supervisor',
  mission: 'Mission',
}

export default function SessionToolbar({ session }: Props) {
  const meta = statusMeta[session.status] || { color: 'bg-gray-500', label: session.status }
  const { childToParent, sessions } = useSessionStore(useShallow((state) => ({
    childToParent: state.childToParent,
    sessions: state.sessions,
  })))
  const parentBinding = childToParent[session.id]
  const parentSession = useMemo(
    () => (parentBinding ? sessions.find((item) => item.id === parentBinding.parentSessionId) : undefined),
    [parentBinding, sessions],
  )

  return (
    <header className="border-b border-white/[0.06] bg-white/[0.01] px-5 py-3.5">
      {/* Parent session binding banner */}
      {parentBinding && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-purple-500/15 bg-purple-500/[0.06] px-3 py-2">
          <ArrowUpLeft size={14} className="shrink-0 text-purple-400" />
          <span className="text-xs text-purple-300">
            子Agent · 来自主会话
          </span>
          <button
            type="button"
            onClick={() => { void workbenchApi.navigation.openSession(parentBinding.parentSessionId) }}
            className="rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-xs text-purple-200 font-medium transition-all hover:bg-purple-400/20 hover:text-white"
          >
            {parentSession?.name || parentBinding.parentSessionId.slice(0, 12)}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${meta.color}`} />
              {['starting', 'running'].includes(session.status) && (
                <span className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${meta.color} animate-ping opacity-30`} />
              )}
            </div>
            <h2 className="truncate text-base font-semibold text-white">{session.name}</h2>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] text-gray-400 font-medium">
              {modeLabel[session.mode] || session.mode}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs text-gray-500">
            <span className="rounded-full bg-blue-500/10 border border-blue-500/15 px-2.5 py-0.5 text-blue-300 font-medium">{session.providerId}</span>
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <FolderOpen size={12} />
              <span className="max-w-[280px] truncate">{session.workingDirectory}</span>
            </span>
          </div>
          {session.worktreePath && !session.worktreeMerged && (
            <div className="mt-2.5">
              <WorktreeActions session={session} />
            </div>
          )}
        </div>
      </div>

      {/* 文件追踪面板 */}
      <FileChangesPanel sessionId={session.id} />
    </header>
  )
}

function FileChangesPanel({ sessionId }: { sessionId: string }) {
  const { sessionChanges, loadSessionChanges } = useTrackerStore(useShallow((state) => ({
    sessionChanges: state.sessionChanges,
    loadSessionChanges: state.loadSessionChanges,
  })))
  const [expanded, setExpanded] = useState(false)
  const changes = sessionChanges[sessionId] || []

  useEffect(() => {
    void loadSessionChanges(sessionId)
    const timer = setInterval(() => void loadSessionChanges(sessionId), 5000)
    return () => clearInterval(timer)
  }, [sessionId, loadSessionChanges])

  if (changes.length === 0) return null

  const changeIcon = (type: string) => {
    switch (type) {
      case 'create': return <FilePlus size={12} className="text-green-400" />
      case 'modify': return <FileEdit size={12} className="text-yellow-400" />
      case 'delete': return <FileX size={12} className="text-red-400" />
      default: return <FileText size={12} className="text-gray-400" />
    }
  }

  const fileName = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1]
  }

  const dirPath = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  }

  return (
    <div className="mt-2 border-t border-white/[0.04] pt-2">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors w-full"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FileText size={12} />
        <span>文件改动</span>
        <span className="rounded-full bg-blue-500/15 border border-blue-500/20 px-1.5 py-0 text-[10px] text-blue-300 font-medium">
          {changes.length}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void loadSessionChanges(sessionId) }}
          className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          title="刷新"
        >
          <RefreshCw size={11} />
        </button>
      </button>

      {expanded && (
        <div className="mt-1.5 max-h-[200px] overflow-y-auto space-y-0.5">
          {changes.map((change: any, i: number) => (
            <div
              key={`${change.filePath}-${i}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white/[0.03] transition-colors"
            >
              {changeIcon(change.changeType)}
              <span className="text-gray-200 font-mono truncate">{fileName(change.filePath)}</span>
              <span className="text-gray-600 truncate text-[10px] flex-1 min-w-0">{dirPath(change.filePath)}</span>
              {change.concurrent && (
                <span className="rounded bg-yellow-500/15 px-1 text-[9px] text-yellow-400">并发</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorktreeActions({ session }: { session: Session }) {
  const { checkMerge, mergeWorktree } = useGitStore(useShallow((state) => ({
    checkMerge: state.checkMerge,
    mergeWorktree: state.mergeWorktree,
  })))
  const [mergeResult, setMergeResult] = useState<{ success: boolean; hasConflicts?: boolean } | null>(null)
  const [merging, setMerging] = useState(false)

  const handleCheckMerge = async () => {
    if (!session.worktreeSourceRepo) return
    const result = await checkMerge(
      session.worktreeSourceRepo,
      session.worktreeBranch,
      session.worktreeBaseBranch || 'main',
    )
    if (result) setMergeResult(result)
  }

  const handleMerge = async () => {
    if (!session.worktreeSourceRepo) return
    setMerging(true)
    const result = await mergeWorktree(
      session.worktreeSourceRepo,
      session.worktreeBranch,
      session.worktreeBaseBranch || 'main',
    )
    if (result) setMergeResult(result)
    setMerging(false)
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[11px] text-emerald-400 font-medium">
        <GitBranch size={11} />
        <span className="max-w-[100px] truncate">{session.worktreeBranch}</span>
      </div>
      <button
        type="button"
        onClick={handleCheckMerge}
        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-gray-400 transition-all hover:bg-white/[0.06] hover:text-white"
        title="检查冲突"
      >
        检查
      </button>
      <button
        type="button"
        onClick={handleMerge}
        disabled={merging}
        className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] text-white transition-all hover:bg-emerald-500 disabled:opacity-40 shadow-sm shadow-emerald-600/20"
        title="合并回主分支"
      >
        <GitMerge size={11} /> 合并
      </button>
      {mergeResult && (
        <span className={`text-[10px] font-medium ${mergeResult.success ? 'text-green-400' : 'text-red-400'}`}>
          {mergeResult.success ? '✓ 已合并' : mergeResult.hasConflicts ? '⚠ 冲突' : '✗ 失败'}
        </span>
      )}
    </div>
  )
}
