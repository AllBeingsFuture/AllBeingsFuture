import { CheckCircle2 } from 'lucide-react'

export default function CompletedView({ mission }: { mission: any }) {
  const summary = mission.summary ?? mission.result
  const phases: any[] = mission.phases ?? mission.executionPlan?.phases ?? []

  return (
    <div className="space-y-4">
      {/* 完成横幅 */}
      <div className="px-4 py-4 bg-emerald-600/10 border border-emerald-600/30 rounded-lg flex items-center gap-3">
        <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-300">任务已完成</p>
          <p className="text-xs text-gray-400 mt-0.5">
            所有执行阶段已成功结束
          </p>
        </div>
      </div>

      {/* 摘要 */}
      {summary && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-2">执行摘要</h4>
          <div className="px-4 py-3 bg-dark-card border border-dark-border rounded-lg">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* 阶段回顾 */}
      {phases.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-2">
            阶段回顾 ({phases.length})
          </h4>
          <div className="space-y-1.5">
            {phases.map((phase: any, idx: number) => (
              <div
                key={phase.id || idx}
                className="flex items-center gap-3 px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg"
              >
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span className="text-sm text-gray-300 flex-1">
                  {phase.name || phase.title || `阶段 ${idx + 1}`}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                  已完成
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
