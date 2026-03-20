import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'

export default function FailedView({ mission }: { mission: any }) {
  const errorMsg = mission.error ?? mission.failureReason
  const phases: any[] = mission.phases ?? mission.executionPlan?.phases ?? []

  return (
    <div className="space-y-4">
      {/* 失败横幅 */}
      <div className="px-4 py-4 bg-red-600/10 border border-red-600/30 rounded-lg flex items-center gap-3">
        <AlertTriangle size={24} className="text-red-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-300">任务执行失败</p>
          {errorMsg && (
            <p className="text-xs text-gray-400 mt-0.5">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* 阶段状态 */}
      {phases.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-2">阶段状态</h4>
          <div className="space-y-1.5">
            {phases.map((phase: any, idx: number) => {
              const ps = phase.status ?? 'pending'
              return (
                <div
                  key={phase.id || idx}
                  className="flex items-center gap-3 px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg"
                >
                  {ps === 'completed' ? (
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  ) : ps === 'failed' ? (
                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                  ) : (
                    <Circle size={14} className="text-gray-500 shrink-0" />
                  )}
                  <span className="text-sm text-gray-300 flex-1">
                    {phase.name || phase.title || `阶段 ${idx + 1}`}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                      ps === 'completed'
                        ? 'bg-emerald-600'
                        : ps === 'failed'
                          ? 'bg-red-600'
                          : 'bg-gray-600'
                    }`}
                  >
                    {ps === 'completed' ? '已完成' : ps === 'failed' ? '失败' : '未执行'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
