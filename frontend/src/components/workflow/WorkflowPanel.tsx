import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Circle,
  Workflow,
  Loader2,
} from 'lucide-react'
import { workbenchApi } from '../../app/api/workbench'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflowStore'
import { statusColors, statusLabels } from './workflowConstants'
import WorkflowDetail from './WorkflowDetail'
import WorkflowFormModal from './WorkflowFormModal'

export default function WorkflowPanel() {
  const { workflows, activeWorkflows, selectedId, loading } = useWorkflowStore(useShallow((state) => ({
    workflows: state.workflows,
    activeWorkflows: state.activeWorkflows,
    selectedId: state.selectedId,
    loading: state.loading,
  })))

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<any | null>(null)
  const refreshWorkflows = useCallback(() => {
    void workbenchApi.workflow.load()
    void workbenchApi.workflow.loadHistory()
  }, [])

  // 初始化加载
  useEffect(() => {
    refreshWorkflows()
  }, [refreshWorkflows])

  // 定时刷新活跃工作流
  useEffect(() => {
    const timer = setInterval(refreshWorkflows, 5000)
    return () => clearInterval(timer)
  }, [refreshWorkflows])

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow: any) => workflow.id === selectedId),
    [selectedId, workflows],
  )

  return (
    <div className="flex h-full">
      {/* -------- 左侧：工作流列表 -------- */}
      <div className="w-72 border-r border-dark-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">工作流管理</h2>
          <button
            onClick={() => {
              setEditingWorkflow(null)
              setShowCreateModal(true)
            }}
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover"
            title="新建工作流"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* 活跃执行 */}
          {activeWorkflows.length > 0 && (
            <section>
              <h3 className="text-xs text-gray-500 px-2 mb-1">
                运行中 ({activeWorkflows.length})
              </h3>
              {activeWorkflows.map((exec: any) => (
                <button
                  key={exec.id}
                  onClick={() => { void workbenchApi.workflow.select(exec.workflowId) }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedId === exec.workflowId
                      ? 'bg-dark-accent/20 text-white'
                      : 'hover:bg-dark-hover text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Circle
                      size={8}
                      className={`fill-current ${statusColors[exec.status] || 'text-gray-400'}`}
                    />
                    <span className="truncate flex-1">{exec.workflowName || exec.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 ml-4">
                    {statusLabels[exec.status] || exec.status}
                    {exec.currentStep && ` — ${exec.currentStep}`}
                  </div>
                </button>
              ))}
            </section>
          )}

          {/* 工作流定义 */}
          <section>
            <h3 className="text-xs text-gray-500 px-2 mb-1">
              全部定义 ({workflows.length})
            </h3>
            {loading && workflows.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                暂无工作流，点击 + 创建
              </div>
            ) : (
              workflows.map((wf: any) => (
                <button
                  key={wf.id}
                  onClick={() => { void workbenchApi.workflow.select(wf.id) }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                    selectedId === wf.id
                      ? 'bg-dark-accent/20 text-white'
                      : 'hover:bg-dark-hover text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Workflow size={14} className="shrink-0 text-gray-400" />
                    <span className="text-sm truncate flex-1">{wf.name}</span>
                    {wf.isTemplate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white shrink-0">
                        模板
                      </span>
                    )}
                  </div>
                  {wf.description && (
                    <div className="text-xs text-gray-500 mt-0.5 ml-5 truncate">
                      {wf.description}
                    </div>
                  )}
                </button>
              ))
            )}
          </section>
        </div>

        <div className="p-2 border-t border-dark-border">
          <button
            onClick={() => {
              setEditingWorkflow(null)
              setShowCreateModal(true)
            }}
            className="w-full py-2 text-sm text-dark-accent hover:bg-dark-accent/10 rounded-lg transition-colors"
          >
            + 新建工作流
          </button>
        </div>
      </div>

      {/* -------- 右侧：详情区域 -------- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedWorkflow ? (
          <WorkflowDetail
            workflow={selectedWorkflow}
            onEdit={() => {
              setEditingWorkflow(selectedWorkflow)
              setShowCreateModal(true)
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Workflow size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">选择一个工作流查看详情</p>
              <p className="text-xs mt-1">或点击 + 创建新的工作流</p>
            </div>
          </div>
        )}
      </div>

      {/* -------- 弹窗 -------- */}
      {showCreateModal && (
        <WorkflowFormModal
          workflow={editingWorkflow}
          onClose={() => {
            setShowCreateModal(false)
            setEditingWorkflow(null)
          }}
        />
      )}
    </div>
  )
}
