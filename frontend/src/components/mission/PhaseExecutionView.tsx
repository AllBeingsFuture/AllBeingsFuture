import { useState, useEffect } from 'react'
import { ListChecks, Edit3, CheckCircle2, Loader2, ChevronRight } from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'
import type { MissionStatus } from './missionConstants'

function OverallProgress({
  phases,
  currentIndex,
}: {
  phases: any[]
  currentIndex: number
}) {
  const completed = phases.filter(
    (p: any, i: number) => p.status === 'completed' || i < currentIndex,
  ).length
  const total = phases.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="px-4 py-3 bg-dark-card border border-dark-border rounded-lg">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span>总体进度</span>
        <span>
          {completed}/{total} 阶段 ({pct}%)
        </span>
      </div>
      <div className="w-full h-2 bg-dark-bg rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function PhaseExecutionView({ mission }: { mission: any }) {
  const { confirmPhases } = useMissionStore()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [confirming, setConfirming] = useState(false)

  const phases: any[] = mission.phases ?? mission.executionPlan?.phases ?? []
  const currentPhaseIndex = mission.currentPhaseIndex ?? mission.currentPhase ?? 0
  const status = (mission.status ?? 'ready') as MissionStatus

  useEffect(() => {
    if (phases.length > 0) {
      setEditContent(JSON.stringify(phases, null, 2))
    }
  }, [phases])

  // 就绪状态下允许编辑确认阶段
  const needsConfirmation = status === 'ready' && phases.length > 0

  const handleConfirmPhases = async () => {
    setConfirming(true)
    try {
      const data = JSON.parse(editContent)
      await confirmPhases(mission.id, Array.isArray(data) ? { phases: data } : data)
    } catch {
      // 忽略 JSON 解析失败
    } finally {
      setConfirming(false)
    }
  }

  if (phases.length === 0 && status === 'ready') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <ListChecks size={32} className="mx-auto mb-3 text-yellow-400 animate-pulse" />
          <p className="text-sm text-gray-300">AI 正在制定执行计划...</p>
          <p className="text-xs text-gray-500 mt-1">即将生成阶段规划</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <ListChecks size={16} className="text-yellow-400" />
          执行阶段
          <span className="text-xs text-gray-500 font-normal">
            ({phases.length} 个阶段)
          </span>
        </h4>
        {needsConfirmation && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(!editing)}
              className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover flex items-center gap-1"
            >
              <Edit3 size={12} />
              {editing ? '预览' : '编辑'}
            </button>
            <button
              onClick={handleConfirmPhases}
              disabled={confirming}
              className="px-3 py-1.5 text-xs bg-dark-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 flex items-center gap-1"
            >
              {confirming ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              确认计划
            </button>
          </div>
        )}
      </div>

      {/* 总体进度 */}
      {status === 'running' && phases.length > 0 && (
        <OverallProgress phases={phases} currentIndex={currentPhaseIndex} />
      )}

      {/* 阶段列表 / 编辑区 */}
      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={20}
          spellCheck={false}
          className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono outline-none focus:border-dark-accent resize-none leading-relaxed"
        />
      ) : (
        <div className="space-y-2">
          {phases.map((phase: any, idx: number) => {
            const isActive = idx === currentPhaseIndex && status === 'running'
            const isCompleted = idx < currentPhaseIndex
            const phaseStatus = phase.status ?? (isCompleted ? 'completed' : isActive ? 'running' : 'pending')

            return (
              <div
                key={phase.id || idx}
                className={`px-4 py-3 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-dark-accent/10 border-dark-accent/30'
                    : 'bg-dark-card border-dark-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* 序号 / 状态指示 */}
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isActive
                          ? 'bg-dark-accent text-white'
                          : 'bg-dark-bg text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={14} />
                    ) : isActive ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      idx + 1
                    )}
                  </span>

                  {/* 阶段信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          isActive ? 'text-white' : isCompleted ? 'text-gray-400' : 'text-gray-300'
                        }`}
                      >
                        {phase.name || phase.title || `阶段 ${idx + 1}`}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                          phaseStatus === 'completed'
                            ? 'bg-emerald-600'
                            : phaseStatus === 'running'
                              ? 'bg-green-600'
                              : phaseStatus === 'failed'
                                ? 'bg-red-600'
                                : 'bg-gray-600'
                        }`}
                      >
                        {phaseStatus === 'completed'
                          ? '已完成'
                          : phaseStatus === 'running'
                            ? '执行中'
                            : phaseStatus === 'failed'
                              ? '失败'
                              : '等待中'}
                      </span>
                    </div>
                    {(phase.description || phase.goal) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {phase.description || phase.goal}
                      </p>
                    )}
                    {phase.assignedRoles && Array.isArray(phase.assignedRoles) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {phase.assignedRoles.map((role: string, i: number) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg text-gray-400"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 阶段进度 */}
                  {isActive && phase.progress != null && (
                    <div className="w-20 shrink-0">
                      <div className="text-[10px] text-gray-500 text-right mb-0.5">
                        {phase.progress}%
                      </div>
                      <div className="w-full h-1.5 bg-dark-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-dark-accent rounded-full transition-all duration-500"
                          style={{ width: `${phase.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <ChevronRight
                    size={14}
                    className={`shrink-0 ${isActive ? 'text-dark-accent' : 'text-gray-600'}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
