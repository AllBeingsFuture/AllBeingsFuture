import { useState, useEffect } from 'react'
import { Brain, Edit3, CheckCircle2, Loader2 } from 'lucide-react'

export default function BrainstormView({
  mission,
  onConfirm,
  loading,
}: {
  mission: any
  onConfirm: (data: any) => void
  loading: boolean
}) {
  const brainstorm = mission.brainstorm ?? mission.brainstormResult
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    if (brainstorm) {
      setEditContent(
        typeof brainstorm === 'string' ? brainstorm : JSON.stringify(brainstorm, null, 2),
      )
    }
  }, [brainstorm])

  if (!brainstorm) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Brain size={32} className="mx-auto mb-3 text-blue-400 animate-pulse" />
          <p className="text-sm text-gray-300">AI 正在进行头脑风暴...</p>
          <p className="text-xs text-gray-500 mt-1">分析任务并生成方案</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Brain size={16} className="text-blue-400" />
          头脑风暴结果
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover flex items-center gap-1"
          >
            <Edit3 size={12} />
            {editing ? '预览' : '编辑'}
          </button>
          <button
            onClick={() => {
              try {
                const data = JSON.parse(editContent)
                onConfirm(data)
              } catch {
                onConfirm(editContent)
              }
            }}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-dark-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 flex items-center gap-1"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            确认方案
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={20}
          spellCheck={false}
          className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono outline-none focus:border-dark-accent resize-none leading-relaxed"
        />
      ) : (
        <div className="px-4 py-3 bg-dark-card border border-dark-border rounded-lg">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {typeof brainstorm === 'string'
              ? brainstorm
              : JSON.stringify(brainstorm, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
