import { useMemo } from 'react'
import { Bot, GitBranch, RotateCcw, Square, Trash2, ArrowUpLeft } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
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
    <div
      className={[
        'group relative border-b border-[#1e1e1e] px-3 py-2.5 transition-all duration-150 cursor-pointer',
        selected
          ? 'bg-[#171717] border-l-2 border-l-[#ff4f1a]'
          : 'hover:bg-[#111]',
      ].join(' ')}
      data-session-id={session.id}
      onClick={() => onSelect(session.id)}
    >
      {/* No selected indicator — handled by left border on container */}

      {/* Main content */}
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1 py-0.5">
          {/* Status indicator */}
          <div className="relative mt-1 shrink-0">
            <div className={['w-[6px] h-[6px]', isActive ? 'bg-[#3eb550]' : 'bg-[#333]'].join(' ')} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Bot size={13} className={`shrink-0 ${selected ? 'text-blue-400' : 'text-blue-400/50'}`} />
              <p className={`truncate text-[12px] font-500 leading-tight ${selected ? 'text-[#e8e4de]' : 'text-[#aaa]'}`}>{session.name}</p>
            </div>
            <p className="mt-1 truncate text-[11px] text-gray-500 leading-tight">{getShortPath(session.workingDirectory)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="border border-[#2e2e2e] bg-[#171717] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#666] font-600">
                {session.providerId}
              </span>
              <span className={`text-[9px] uppercase tracking-widest font-600 ${isActive ? 'text-[#3eb550]' : 'text-[#444]'}`}>
                {STATUS_LABELS[session.status] || session.status}
              </span>
              <span className="text-[#3a3a3a] text-[9px] tabular-nums">{formatSessionTime(session)}</span>
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
