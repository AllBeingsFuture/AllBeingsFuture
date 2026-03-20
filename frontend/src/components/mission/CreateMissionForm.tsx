import { useState, useEffect } from 'react'
import {
  Target,
  FolderOpen,
  AlertTriangle,
  Loader2,
  Rocket,
} from 'lucide-react'
import { useMissionStore } from '../../stores/missionStore'

export default function CreateMissionForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { createMission, roleTemplates, loadRoleTemplates } = useMissionStore()

  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [workDir, setWorkDir] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (roleTemplates.length === 0) loadRoleTemplates()
  }, [])

  const handleCreate = async () => {
    if (!objective.trim()) return
    setCreating(true)
    setError('')
    try {
      const result = await createMission({
        objective: objective.trim(),
        context: context.trim() || undefined,
        workDir: workDir.trim() || undefined,
        roleTemplate: selectedTemplate || undefined,
      })
      if (result?.id) {
        onCreated(result.id)
        setObjective('')
        setContext('')
        setWorkDir('')
        setSelectedTemplate('')
      }
    } catch (err: any) {
      setError(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center mb-6">
          <Target size={40} className="mx-auto mb-3 text-dark-accent opacity-60" />
          <h3 className="text-lg font-semibold text-gray-200">创建自主任务</h3>
          <p className="text-xs text-gray-500 mt-1">
            定义目标后，AI 将自动进行头脑风暴、团队设计和阶段规划
          </p>
        </div>

        {/* 目标 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">任务目标 *</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="描述你希望 AI 团队完成的目标..."
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent resize-none"
          />
        </div>

        {/* 项目上下文 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">项目上下文</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="项目背景、技术栈、约束条件等..."
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent resize-none"
          />
        </div>

        {/* 工作目录 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">工作目录</label>
          <div className="relative">
            <FolderOpen
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              value={workDir}
              onChange={(e) => setWorkDir(e.target.value)}
              placeholder="C:\Users\..."
              className="w-full pl-9 pr-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
          </div>
        </div>

        {/* 角色模板 */}
        {roleTemplates.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">角色模板</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent appearance-none"
            >
              <option value="">自动选择（由 AI 决定）</option>
              {roleTemplates.map((t: any) => (
                <option key={t.id || t.name} value={t.id || t.name}>
                  {t.name} — {t.description || `${t.roles?.length ?? 0} 个角色`}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}

        <button
          onClick={handleCreate}
          disabled={!objective.trim() || creating}
          className="w-full py-2.5 text-sm bg-dark-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
        >
          {creating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Rocket size={14} />
          )}
          {creating ? '创建中...' : '创建任务'}
        </button>
      </div>
    </div>
  )
}
