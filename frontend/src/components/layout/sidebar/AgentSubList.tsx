import { useState, useEffect, useMemo } from 'react'
import { Cpu, ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentInfo } from '../../../core/chat/chatCore'

export type AgentsByParent = Record<string, AgentInfo[]>

interface Props {
  /** Direct children of the current parent session / agent. */
  agents: AgentInfo[]
  /** Full map: parentSessionId → child agents (for nested sons under a father). */
  agentsByParent?: AgentsByParent
  onSelectSession?: (sessionId: string) => void
  /** Nesting depth (0 = under root session). Cap at MAX_DEPTH. */
  depth?: number
}

const MAX_DEPTH = 5

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-400',
  running: 'bg-blue-400 animate-pulse',
  idle: 'bg-cyan-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  cancelled: 'bg-slate-400',
}

const statusLabels: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  idle: '待命',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

/** Live sub-tasks only. Terminal statuses must never linger in the sidebar. */
const ACTIVE_STATUSES = new Set(['pending', 'running', 'idle'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function isActiveAgent(agent: AgentInfo): boolean {
  return ACTIVE_STATUSES.has(agent.status) && !TERMINAL_STATUSES.has(agent.status)
}

export default function AgentSubList({
  agents,
  agentsByParent,
  onSelectSession,
  depth = 0,
}: Props) {
  const visibleAgents = useMemo(
    () => agents.filter(isActiveAgent),
    [agents],
  )
  const hasActive = visibleAgents.length > 0
  const [expanded, setExpanded] = useState(hasActive)

  useEffect(() => {
    if (hasActive) setExpanded(true)
  }, [hasActive])

  if (depth > MAX_DEPTH) return null
  if (visibleAgents.length === 0) return null

  return (
    <div className={`mt-1 border-l border-white/10 pl-2 ${depth === 0 ? 'ml-3' : 'ml-2'}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition py-1 w-full"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Cpu size={12} className="text-blue-300" />
        <span>↳{visibleAgents.length}个子任务</span>
        {hasActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
      </button>

      {expanded && (
        <div className="space-y-0.5 mt-0.5">
          {visibleAgents.map((agent) => {
            const nested = (agentsByParent?.[agent.childSessionId] || []).filter(isActiveAgent)
            return (
              <div key={agent.agentId}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectSession?.(agent.childSessionId) }}
                  className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5 transition"
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColors[agent.status] || 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-200 truncate">
                      Agent: {agent.name || agent.agentId.slice(0, 8)}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {statusLabels[agent.status] || agent.status}
                      {agent.providerId && ` · ${agent.providerId}`}
                    </p>
                  </div>
                </button>
                {nested.length > 0 && depth < MAX_DEPTH && (
                  <AgentSubList
                    agents={nested}
                    agentsByParent={agentsByParent}
                    onSelectSession={onSelectSession}
                    depth={depth + 1}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
