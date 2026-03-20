import { useState, useEffect } from 'react'
import { Plus, Circle, Trash2, Loader2 } from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'
import { statusColors, statusBg, statusLabels, type MissionStatus } from './missionConstants'
import MissionDetail from './MissionDetail'
import CreateMissionForm from './CreateMissionForm'

export default function MissionPanel() {
  const {
    missions,
    currentMission,
    loading,
    load,
    loadRoleTemplates,
    getMission,
    deleteMission,
  } = useMissionStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    load()
    loadRoleTemplates()
  }, [])

  // 定时刷新执行中的任务
  useEffect(() => {
    const hasActive = missions.some(
      (m: any) => m.status === 'running' || m.status === 'brainstorming' || m.status === 'team_design',
    )
    if (!hasActive) return
    const timer = setInterval(() => {
      load()
      if (selectedId) getMission(selectedId)
    }, 4000)
    return () => clearInterval(timer)
  }, [missions, selectedId])

  const handleSelect = async (id: string) => {
    setSelectedId(id)
    await getMission(id)
  }

  const handleDelete = async (id: string) => {
    await deleteMission(id)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="flex h-full">
      {/* -------- 左侧：任务列表 -------- */}
      <div className="w-72 border-r border-dark-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">自主任务</h2>
          <button
            onClick={() => setSelectedId(null)}
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover"
            title="新建任务"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && missions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : missions.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              暂无任务，点击 + 创建
            </div>
          ) : (
            missions.map((m: any) => {
              const status = (m.status ?? 'planning') as MissionStatus
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                    selectedId === m.id
                      ? 'bg-dark-accent/20 text-white'
                      : 'hover:bg-dark-hover text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Circle
                      size={8}
                      className={`fill-current shrink-0 ${statusColors[status]}`}
                    />
                    <span className="text-sm truncate flex-1">
                      {m.objective?.slice(0, 40) || m.id.slice(0, 12)}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded text-white shrink-0 ${statusBg[status]}`}
                    >
                      {statusLabels[status]}
                    </span>
                  </div>
                  {m.context && (
                    <div className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                      {m.context}
                    </div>
                  )}
                  {/* 悬停删除 */}
                  <div
                    className="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(m.id)
                    }}
                  >
                    <Trash2 size={12} className="text-gray-600 hover:text-red-400" />
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="p-2 border-t border-dark-border">
          <button
            onClick={() => setSelectedId(null)}
            className="w-full py-2 text-sm text-dark-accent hover:bg-dark-accent/10 rounded-lg transition-colors"
          >
            + 新建自主任务
          </button>
        </div>
      </div>

      {/* -------- 右侧：详情区域 -------- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedId && currentMission ? (
          <MissionDetail
            mission={currentMission}
            onDelete={() => handleDelete(currentMission.id)}
          />
        ) : (
          <CreateMissionForm onCreated={(id) => handleSelect(id)} />
        )}
      </div>
    </div>
  )
}
