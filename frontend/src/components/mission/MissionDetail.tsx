import { useState } from 'react'
import {
  Play,
  Pause,
  Square,
  Trash2,
  SkipForward,
  Target,
} from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'
import { statusColors, statusBg, statusLabels, phaseIcons, type MissionStatus } from './missionConstants'
import PlanningView from './PlanningView'
import BrainstormView from './BrainstormView'
import TeamDesignView from './TeamDesignView'
import PhaseExecutionView from './PhaseExecutionView'
import CompletedView from './CompletedView'
import FailedView from './FailedView'

export default function MissionDetail({ mission, onDelete }: { mission: any; onDelete: () => void }) {
  const {
    confirmBrainstorm,
    confirmTeamDesign,
    startMission,
    pauseMission,
    resumeMission,
    abortMission,
    skipPhase,
    getMission,
  } = useMissionStore()

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const status = (mission.status ?? 'planning') as MissionStatus
  const StatusIcon = phaseIcons[status] ?? Target

  const runAction = async (fn: () => Promise<any>) => {
    setActionLoading(true)
    try {
      await fn()
      await getMission(mission.id)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      {/* 顶栏 */}
      <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon size={18} className={statusColors[status]} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 truncate">
              {mission.objective?.slice(0, 60) || '未命名任务'}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded text-white ${statusBg[status]}`}
              >
                {statusLabels[status]}
              </span>
              {mission.workDir && (
                <span className="text-xs text-gray-500 truncate">
                  {mission.workDir}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* 运行控制 */}
          {status === 'ready' && (
            <button
              onClick={() => runAction(() => startMission(mission.id))}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 disabled:opacity-40"
            >
              <Play size={12} /> 启动
            </button>
          )}
          {status === 'running' && (
            <>
              <button
                onClick={() => runAction(() => pauseMission(mission.id))}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-1 disabled:opacity-40"
              >
                <Pause size={12} /> 暂停
              </button>
              <button
                onClick={() => runAction(() => skipPhase(mission.id))}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover flex items-center gap-1 disabled:opacity-40"
              >
                <SkipForward size={12} /> 跳过阶段
              </button>
            </>
          )}
          {status === 'paused' && (
            <button
              onClick={() => runAction(() => resumeMission(mission.id))}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 disabled:opacity-40"
            >
              <Play size={12} /> 恢复
            </button>
          )}
          {(status === 'running' || status === 'paused') && (
            <button
              onClick={() => runAction(() => abortMission(mission.id))}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 flex items-center gap-1 disabled:opacity-40"
            >
              <Square size={12} /> 终止
            </button>
          )}
          {/* 删除 */}
          {confirmDeleteVisible ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
              <button
                onClick={() => setConfirmDeleteVisible(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteVisible(true)}
              className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 flex items-center gap-1"
            >
              <Trash2 size={12} /> 删除
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 - 根据状态显示 */}
      <div className="flex-1 overflow-y-auto p-5">
        {status === 'planning' && <PlanningView mission={mission} />}
        {status === 'brainstorming' && (
          <BrainstormView
            mission={mission}
            onConfirm={(data) => runAction(() => confirmBrainstorm(mission.id, data))}
            loading={actionLoading}
          />
        )}
        {status === 'team_design' && (
          <TeamDesignView
            mission={mission}
            onConfirm={(data) => runAction(() => confirmTeamDesign(mission.id, data))}
            loading={actionLoading}
          />
        )}
        {(status === 'ready' || status === 'running' || status === 'paused') && (
          <PhaseExecutionView mission={mission} />
        )}
        {status === 'completed' && <CompletedView mission={mission} />}
        {status === 'failed' && <FailedView mission={mission} />}
      </div>
    </>
  )
}
