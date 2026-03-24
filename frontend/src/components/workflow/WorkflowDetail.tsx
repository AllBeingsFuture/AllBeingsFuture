import { useEffect, useMemo, useState } from 'react'
import {
  Play,
  Trash2,
  Edit3,
  Circle,
  ChevronRight,
  Clock,
  FileJson,
  History,
  Loader2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflowStore'
import { statusColors, statusLabels, stepTypeLabels, stepTypeBadgeColors } from './workflowConstants'
import ActiveExecutionCard from './ActiveExecutionCard'
import StartWorkflowDialog from './StartWorkflowDialog'

export default function WorkflowDetail({ workflow, onEdit }: { workflow: any; onEdit: () => void }) {
  const { remove, stop, approveStep, getStatus, activeWorkflows, executions, loadExecutionHistory } =
    useWorkflowStore(useShallow((state) => ({
      remove: state.remove,
      stop: state.stop,
      approveStep: state.approveStep,
      getStatus: state.getStatus,
      activeWorkflows: state.activeWorkflows,
      executions: state.executions,
      loadExecutionHistory: state.loadExecutionHistory,
    })))

  const [tab, setTab] = useState<'overview' | 'active' | 'history'>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [executionStatuses, setExecutionStatuses] = useState<Record<string, any>>({})

  const relatedActive = useMemo(
    () => activeWorkflows.filter((execution: any) => execution.workflowId === workflow.id),
    [activeWorkflows, workflow.id],
  )
  const relatedHistory = useMemo(
    () => executions.filter((execution: any) => execution.workflowId === workflow.id),
    [executions, workflow.id],
  )

  // 轮询活跃执行状态
  useEffect(() => {
    if (relatedActive.length === 0) return
    const poll = async () => {
      const statuses: Record<string, any> = {}
      for (const exec of relatedActive) {
        try {
          statuses[exec.id] = await getStatus(exec.id)
        } catch { /* ignore */ }
      }
      setExecutionStatuses(statuses)
    }
    void poll()
    const timer = setInterval(() => void poll(), 3000)
    return () => clearInterval(timer)
  }, [getStatus, relatedActive])

  const handleDelete = async () => {
    await remove(workflow.id)
    setConfirmDelete(false)
  }

  const definition = useMemo(() => {
    try {
      return typeof workflow.definition === 'string'
        ? JSON.parse(workflow.definition)
        : workflow.definition
    } catch {
      return null
    }
  }, [workflow.definition])

  const steps = definition?.steps ?? []

  return (
    <>
      {/* 顶栏 */}
      <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">{workflow.name}</h3>
          {workflow.description && (
            <p className="text-xs text-gray-500 mt-0.5">{workflow.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStartDialog(true)}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
          >
            <Play size={12} /> 启动
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover flex items-center gap-1"
          >
            <Edit3 size={12} /> 编辑
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 flex items-center gap-1"
            >
              <Trash2 size={12} /> 删除
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-border shrink-0">
        <div className="flex gap-4 px-5">
          {(
            [
              { key: 'overview', label: '流程概览', icon: FileJson },
              { key: 'active', label: `运行中 (${relatedActive.length})`, icon: Play },
              { key: 'history', label: '执行历史', icon: History },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                if (key === 'history') void loadExecutionHistory()
              }}
              className={`py-3 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === key
                  ? 'border-dark-accent text-dark-accent'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* 步骤列表 */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">
                流程步骤 ({steps.length})
              </h4>
              {steps.length === 0 ? (
                <p className="text-sm text-gray-500">该工作流未定义任何步骤</p>
              ) : (
                <div className="space-y-2">
                  {steps.map((step: any, idx: number) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 px-4 py-3 bg-dark-card border border-dark-border rounded-lg"
                    >
                      <span className="w-6 h-6 rounded-full bg-dark-bg flex items-center justify-center text-xs text-gray-400 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-200">
                            {step.name || step.id}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                              stepTypeBadgeColors[step.type] || 'bg-gray-600'
                            }`}
                          >
                            {stepTypeLabels[step.type] || step.type}
                          </span>
                        </div>
                        {step.dependsOn?.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            依赖: {step.dependsOn.join(', ')}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-gray-600 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 原始定义 */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">JSON 定义</h4>
              <pre className="px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto">
                {typeof workflow.definition === 'string'
                  ? workflow.definition
                  : JSON.stringify(workflow.definition, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {tab === 'active' && (
          <div className="space-y-3">
            {relatedActive.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <Play size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">当前没有运行中的执行</p>
                <button
                  onClick={() => setShowStartDialog(true)}
                  className="mt-3 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  启动工作流
                </button>
              </div>
            ) : (
              relatedActive.map((exec: any) => (
                <ActiveExecutionCard
                  key={exec.id}
                  execution={exec}
                  status={executionStatuses[exec.id]}
                  onStop={() => stop(exec.id)}
                  onApprove={(stepId) => approveStep(exec.id, stepId, true)}
                  onReject={(stepId) => approveStep(exec.id, stepId, false)}
                />
              ))
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            {relatedHistory.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <History size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">暂无执行记录</p>
              </div>
            ) : (
              relatedHistory.map((exec: any) => (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 px-4 py-3 bg-dark-card border border-dark-border rounded-lg"
                >
                  <Circle
                    size={8}
                    className={`fill-current shrink-0 ${statusColors[exec.status] || 'text-gray-400'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200">{exec.id.slice(0, 12)}...</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {statusLabels[exec.status] || exec.status}
                      {exec.startedAt && (
                        <span className="ml-2">
                          {new Date(exec.startedAt).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                  {exec.duration && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={10} />
                      {exec.duration}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 启动弹窗 */}
      {showStartDialog && (
        <StartWorkflowDialog
          workflow={workflow}
          onClose={() => setShowStartDialog(false)}
        />
      )}
    </>
  )
}
