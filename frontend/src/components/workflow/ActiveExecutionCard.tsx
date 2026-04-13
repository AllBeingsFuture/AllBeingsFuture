import {
  Circle,
  Square,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { statusColors, statusLabels, stepTypeLabels, stepTypeBadgeColors } from './workflowConstants'

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-400 shrink-0" />
    case 'running':
      return <Loader2 size={14} className="text-blue-400 animate-spin shrink-0" />
    case 'failed':
      return <XCircle size={14} className="text-red-400 shrink-0" />
    case 'waiting_approval':
      return <AlertTriangle size={14} className="text-orange-400 shrink-0" />
    default:
      return <Circle size={14} className="text-gray-500 shrink-0" />
  }
}

export default function ActiveExecutionCard({
  execution,
  status,
  onStop,
  onApprove,
  onReject,
}: {
  execution: any
  status: any
  onStop: () => void
  onApprove: (stepId: string) => void
  onReject: (stepId: string) => void
}) {
  const steps = status?.steps ?? []
  const completedSteps = steps.filter((s: any) => s.status === 'completed').length
  const totalSteps = steps.length
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return (
    <div className="px-4 py-4 bg-dark-card border border-dark-border rounded-lg space-y-3">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle
            size={8}
            className={`fill-current ${statusColors[execution.status] || 'text-gray-400'}`}
          />
          <span className="text-sm font-medium text-gray-200">
            {execution.workflowName || execution.id.slice(0, 12)}
          </span>
          <span className="text-xs text-gray-500">
            {statusLabels[execution.status] || execution.status}
          </span>
        </div>
        <button
          onClick={onStop}
          className="px-2.5 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 flex items-center gap-1"
        >
          <Square size={10} /> 停止
        </button>
      </div>

      {/* 进度条 */}
      {totalSteps > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>步骤进度</span>
            <span>{completedSteps}/{totalSteps} ({progress}%)</span>
          </div>
          <div className="w-full h-1.5 bg-dark-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-dark-accent rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 步骤列表 */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((step: any) => (
            <div
              key={step.id}
              className="flex items-center gap-2 px-3 py-2 bg-dark-bg rounded-lg"
            >
              <StepStatusIcon status={step.status} />
              <span className="text-xs flex-1 text-gray-300">{step.name || step.id}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                  stepTypeBadgeColors[step.type] || 'bg-gray-600'
                }`}
              >
                {stepTypeLabels[step.type] || step.type}
              </span>
              <span className={`text-xs ${statusColors[step.status] || 'text-gray-500'}`}>
                {statusLabels[step.status] || step.status}
              </span>

              {/* 审批按钮 */}
              {step.status === 'waiting_approval' && (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => onApprove(step.id)}
                    className="p-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    title="批准"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => onReject(step.id)}
                    className="p-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30"
                    title="拒绝"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
