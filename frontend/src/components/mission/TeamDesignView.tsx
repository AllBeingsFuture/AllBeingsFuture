import { useState, useEffect } from 'react'
import { Users, Edit3, CheckCircle2, Loader2 } from 'lucide-react'

export default function TeamDesignView({
  mission,
  onConfirm,
  loading,
}: {
  mission: any
  onConfirm: (data: any) => void
  loading: boolean
}) {
  const design = mission.teamDesign ?? mission.teamDesignResult
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    if (design) {
      setEditContent(
        typeof design === 'string' ? design : JSON.stringify(design, null, 2),
      )
    }
  }, [design])

  if (!design) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Users size={32} className="mx-auto mb-3 text-purple-400 animate-pulse" />
          <p className="text-sm text-gray-300">AI 正在设计团队角色...</p>
          <p className="text-xs text-gray-500 mt-1">基于头脑风暴结果分配角色</p>
        </div>
      </div>
    )
  }

  // 尝试解析角色列表
  const roles: any[] = (() => {
    if (Array.isArray(design)) return design
    if (design?.roles && Array.isArray(design.roles)) return design.roles
    if (design?.team && Array.isArray(design.team)) return design.team
    return []
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Users size={16} className="text-purple-400" />
          团队设计方案
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
            确认团队
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
      ) : roles.length > 0 ? (
        <div className="grid gap-3">
          {roles.map((role: any, idx: number) => (
            <div
              key={role.id || role.name || idx}
              className="px-4 py-3 bg-dark-card border border-dark-border rounded-lg"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: role.color || '#6366f1' }}
                />
                <span className="text-sm font-medium text-gray-200">
                  {role.name || role.roleName || `角色 ${idx + 1}`}
                </span>
                {role.model && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg text-gray-400 ml-auto">
                    {role.model}
                  </span>
                )}
              </div>
              {(role.description || role.systemPrompt) && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                  {role.description || role.systemPrompt}
                </p>
              )}
              {role.capabilities && Array.isArray(role.capabilities) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {role.capabilities.map((cap: string, i: number) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 bg-dark-card border border-dark-border rounded-lg">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {typeof design === 'string' ? design : JSON.stringify(design, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
