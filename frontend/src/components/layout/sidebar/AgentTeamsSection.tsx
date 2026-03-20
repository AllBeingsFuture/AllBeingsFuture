import { ArrowRight, Users2 } from 'lucide-react'
import type { AgentTeamsSectionProps } from './types'

export default function AgentTeamsSection({ instances, onOpenTeams }: AgentTeamsSectionProps) {
  const runningCount = instances.filter((instance) => instance.status === 'running').length
  const memberCount = instances.reduce((count, instance) => count + (instance.members?.length || 0), 0)
  const preview = instances.slice(0, 2)

  return (
    <section className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">团队协作</p>
          <h3 className="mt-2 text-base font-semibold text-white">Agent Teams</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] text-white">
          <Users2 size={18} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">实例</p>
          <p className="mt-2 text-2xl font-semibold text-white">{instances.length}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">成员</p>
          <p className="mt-2 text-2xl font-semibold text-white">{memberCount}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        运行中团队 {runningCount} 个
      </div>

      <div className="mt-4 space-y-2">
        {preview.length > 0 ? (
          preview.map((instance) => (
            <div key={instance.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{instance.name}</p>
                <p className="text-xs text-gray-500">{instance.status}</p>
              </div>
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
                {instance.members?.length || 0}
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 px-3 py-4 text-sm text-gray-500">
            当前没有团队实例，后续可从这里跳转到完整 Teams 工作区。
          </div>
        )}
      </div>

      <button type="button" onClick={onOpenTeams} className="mt-4 inline-flex items-center gap-2 text-sm text-blue-200 transition hover:text-white">
        打开 Teams
        <ArrowRight size={14} />
      </button>
    </section>
  )
}
