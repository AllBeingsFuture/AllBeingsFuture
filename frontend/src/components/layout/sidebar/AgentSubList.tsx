import { useState, useEffect } from 'react'
import { Cpu, ChevronDown, ChevronRight } from 'lucide-react'

interface AgentInfo {
  agentId: string
  name: string
  parentSessionId: string
  childSessionId: string
  status: 'pending' | 'running' | 'idle' | 'completed' | 'failed' | 'cancelled'
  workDir: string
  createdAt: string
  providerId?: string
}

interface Props {
  agents: AgentInfo[]
  onSelectSession?: (sessionId: string) => void
}

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

export default function AgentSubList({ agents, onSelectSession }: Props) {
  const hasActive = agents.some(a => a.status === 'running' || a.status === 'pending' || a.status === 'idle')
  const [expanded, setExpanded] = useState(hasActive)

  useEffect(() => {
    if (hasActive) setExpanded(true)
  }, [hasActive])

  if (agents.length === 0) return null

  return (
    <div className="mt-1 ml-3 border-l border-white/10 pl-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition py-1 w-full"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Cpu size={12} className="text-blue-300" />
        <span>↳{agents.length}个子任务</span>
        {hasActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
      </button>

      {expanded && (
        <div className="space-y-0.5 mt-0.5">
          {agents.map(agent => (
            <button
              key={agent.agentId}
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
          ))}
        </div>
      )}
    </div>
  )
}
