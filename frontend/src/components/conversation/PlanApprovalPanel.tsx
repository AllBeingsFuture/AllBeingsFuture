/**
 * ExitPlanMode 计划审批面板
 *
 * 当 Claude 调用 ExitPlanMode 工具时显示此组件，
 * 展示计划内容（allowedPrompts 列表），让用户选择批准或拒绝。
 */

import React, { useState, useCallback } from 'react'
import { FileText, CheckCircle, XCircle } from 'lucide-react'

interface AllowedPrompt {
  tool?: string
  prompt?: string
}

interface PlanApprovalPanelProps {
  toolInput: Record<string, unknown>
  onApprove: () => void
  onReject: () => void
  disabled?: boolean
}

const PlanApprovalPanel: React.FC<PlanApprovalPanelProps> = ({
  toolInput,
  onApprove,
  onReject,
  disabled = false,
}) => {
  const [decided, setDecided] = useState(false)

  const handleApprove = useCallback(() => {
    if (disabled || decided) return
    setDecided(true)
    onApprove()
  }, [disabled, decided, onApprove])

  const handleReject = useCallback(() => {
    if (disabled || decided) return
    setDecided(true)
    onReject()
  }, [disabled, decided, onReject])

  if (decided) return null

  const allowedPrompts = toolInput.allowedPrompts as AllowedPrompt[] | undefined
  const hasPrompts = Array.isArray(allowedPrompts) && allowedPrompts.length > 0

  const firstValue = Object.values(toolInput)[0]
  const planText = typeof firstValue === 'string' ? firstValue : null

  return (
    <div className="flex justify-center my-3 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-full max-w-2xl rounded-xl border border-yellow-400/30 bg-yellow-400/5 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-400/10 border-b border-yellow-400/20">
          <FileText className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-xs font-medium text-yellow-400">计划已完成 — 请审批</span>
          <span className="text-xs text-gray-500 ml-auto">Claude 请求退出计划模式</span>
        </div>

        <div className="px-4 py-3">
          {hasPrompts ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-2">计划执行步骤：</div>
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {allowedPrompts!.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-gray-800 text-gray-500 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      {item.tool && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-500 mr-1.5">
                          {item.tool}
                        </span>
                      )}
                      <span className="text-gray-300">{item.prompt || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : planText ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono leading-relaxed">
              {planText}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">Claude 已完成计划，点击「批准」开始执行。</p>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 flex items-center justify-end gap-3 border-t border-yellow-400/10">
          <button
            onClick={handleReject}
            disabled={disabled}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium',
              'border border-red-400/30 text-red-400 bg-red-400/5',
              'hover:bg-red-400/10 hover:border-red-400/50 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            ].join(' ')}
          >
            <XCircle className="w-3.5 h-3.5" />
            拒绝计划
          </button>
          <button
            onClick={handleApprove}
            disabled={disabled}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium',
              'bg-green-500 text-white',
              'hover:bg-green-500/80 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            ].join(' ')}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            批准计划
          </button>
        </div>
      </div>
    </div>
  )
}

PlanApprovalPanel.displayName = 'PlanApprovalPanel'
export default PlanApprovalPanel
