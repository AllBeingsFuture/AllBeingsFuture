import { Bot, GitBranch, RotateCcw, Square, Trash2, ArrowUpLeft } from 'lucide-react'
import type { SessionItemProps } from './types'
import { ACTIVE_STATUSES, STATUS_LABELS } from './types'
import { formatSessionTime, getShortPath } from './utils'
import AgentSubList from './AgentSubList'
import { useSessionStore } from '../../../stores/sessionStore'

const modeLabels: Record<string, string> = {
  normal: 'Normal',
  supervisor: 'Supervisor',
  mission: 'Mission',
}

export default function SessionItem({ session, selected, onSelect, onResume, onEnd, onRemove, agents }: SessionItemProps) {
  const isActive = ACTIVE_STATUSES.has(session.status)
  const childToParent = useSessionStore((s) => s.childToParent)
  const sessions = useSessionStore((s) => s.sessions)
  const parentBinding = childToParent[session.id]
  const parentSession = parentBinding ? sessions.find((s) => s.id === parentBinding.parentSessionId) : undefined

  return (
    <div
      className={[
        'group relative rounded-xl border p-2.5 transition-all duration-200 cursor-pointer',
        selected
          ? 'border-blue-500/25 bg-blue-500/[0.08] shadow-[0_2px_12px_rgba(59,130,246,0.12)]'
          : 'border-white/[0.04] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.04] hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
      ].join(' ')}
      data-session-id={session.id}
      onClick={() => onSelect(session.id)}
    >
      {/* Selected indicator bar */}
      {selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
      )}

      {/* Main content */}
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1 py-0.5">
          {/* Status indicator */}
          <div className="relative mt-1 shrink-0">
            <div className={['h-2.5 w-2.5 rounded-full ring-2', isActive ? 'bg-emerald-400 ring-emerald-400/20' : 'bg-gray-600 ring-gray-600/20'].join(' ')} />
            {isActive && <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping opacity-30" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Bot size={13} className={`shrink-0 ${selected ? 'text-blue-400' : 'text-blue-400/50'}`} />
              <p className={`truncate text-[13px] font-medium leading-tight ${selected ? 'text-gray-100' : 'text-gray-300'}`}>{session.name}</p>
            </div>
            <p className="mt-1 truncate text-[11px] text-gray-500 leading-tight">{getShortPath(session.workingDirectory)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 uppercase tracking-wider text-gray-400 font-medium">
                {session.providerId}
              </span>
              <span className={[
                'rounded-md px-1.5 py-0.5 font-medium',
                isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-white/[0.03] text-gray-500'
              ].join(' ')}>
                {STATUS_LABELS[session.status] || session.status}
              </span>
              <span className="text-gray-600">{modeLabels[session.mode] || session.mode}</span>
              <span className="text-gray-600 tabular-nums">{formatSessionTime(session)}</span>
              {parentBinding && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelect(parentBinding.parentSessionId) }}
                  className="inline-flex items-center gap-0.5 rounded-md border border-purple-400/15 bg-purple-500/[0.08] px-1.5 py-0.5 text-[10px] text-purple-300 font-medium transition-all hover:bg-purple-500/15 hover:text-purple-200"
                  title={`来自: ${parentSession?.name || parentBinding.parentSessionId}`}
                >
                  <ArrowUpLeft size={9} />
                  <span className="max-w-[60px] truncate">{parentSession?.name || '主会话'}</span>
                </button>
              )}
            </div>
            {session.worktreeBranch && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${session.worktreeMerged ? 'border-green-400/15 bg-green-500/[0.08] text-green-400' : 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-400'}`}>
                  <GitBranch size={10} />
                  <span className="max-w-[100px] truncate">{session.worktreeBranch}</span>
                </div>
                {session.worktreeMerged && (
                  <span className="rounded-md bg-green-900/30 px-1 py-0.5 text-[9px] text-green-400 font-medium">已合并</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="flex flex-col gap-1 opacity-100 md:opacity-0 md:transition-all md:duration-200 md:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {!isActive && onResume && (
            <button
              type="button"
              aria-label={`恢复 ${session.name}`}
              onClick={() => onResume(session.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-400/20 bg-blue-400/[0.08] px-2 py-1 text-[11px] text-blue-300 transition-all hover:bg-blue-400/15 hover:border-blue-400/30"
            >
              <RotateCcw size={11} />
            </button>
          )}
          {isActive && onEnd && (
            <button
              type="button"
              aria-label={`结束 ${session.name}`}
              onClick={() => onEnd(session.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-gray-300"
            >
              <Square size={11} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`删除 ${session.name}`}
              onClick={() => onRemove(session.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 transition-all hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-400"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Agent sub-list: displayed below the main content as a collapsible section */}
      {agents && agents.length > 0 && (
        <AgentSubList agents={agents} onSelectSession={onSelect} />
      )}
    </div>
  )
}
