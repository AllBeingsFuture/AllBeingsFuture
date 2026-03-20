import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useTeamStore } from '../../stores/teamStore'
import type { TeamDefinition, TeamRoleDefinition } from '../../../bindings/allbeingsfuture/internal/models/models'

const defaultColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

interface Props {
  team: TeamDefinition | null
  onClose: () => void
}

interface RoleForm {
  roleName: string
  displayName: string
  systemPrompt: string
  providerId: string
  color: string
}

const emptyRole = (): RoleForm => ({
  roleName: '',
  displayName: '',
  systemPrompt: '',
  providerId: 'claude-code',
  color: defaultColors[Math.floor(Math.random() * defaultColors.length)],
})

export default function TeamTemplateEditor({ team, onClose }: Props) {
  const { createDefinition, updateDefinition, deleteDefinition, addRole, updateRole, deleteRole } = useTeamStore()

  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [roles, setRoles] = useState<RoleForm[]>(
    team?.roles.map(r => ({
      roleName: r.roleName,
      displayName: r.displayName,
      systemPrompt: r.systemPrompt,
      providerId: r.providerId,
      color: r.color,
    })) ?? [emptyRole()]
  )

  const isEditing = !!team

  const handleSave = async () => {
    if (!name.trim()) return
    if (isEditing) {
      await updateDefinition(team!.id, name, description)
      // Update roles individually (simplified — in production you'd diff)
      for (const role of roles) {
        const existing = team!.roles.find(r => r.roleName === role.roleName)
        if (existing) {
          await updateRole(existing.id, role as any)
        } else {
          await addRole(team!.id, role as any)
        }
      }
    } else {
      await createDefinition(name, description, roles as any)
    }
    onClose()
  }

  const handleDelete = async () => {
    if (team && confirm('确定删除此团队模板？')) {
      await deleteDefinition(team.id)
      onClose()
    }
  }

  const addEmptyRole = () => setRoles([...roles, emptyRole()])

  const updateRoleField = (idx: number, field: keyof RoleForm, value: string) => {
    const updated = [...roles]
    updated[idx] = { ...updated[idx], [field]: value }
    setRoles(updated)
  }

  const removeRole = (idx: number) => {
    if (roles.length <= 1) return
    setRoles(roles.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-card rounded-xl border border-dark-border w-[640px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h3 className="text-lg font-semibold">{isEditing ? '编辑团队模板' : '新建团队模板'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">团队名称</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：全栈开发团队"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">描述</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="团队的整体目标描述"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm outline-none focus:border-dark-accent"
            />
          </div>

          {/* Roles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">角色列表</label>
              <button
                onClick={addEmptyRole}
                className="text-xs text-dark-accent hover:text-blue-400 flex items-center gap-1"
              >
                <Plus size={14} /> 添加角色
              </button>
            </div>

            <div className="space-y-3">
              {roles.map((role, idx) => (
                <div key={idx} className="p-3 bg-dark-bg rounded-lg border border-dark-border space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full shrink-0 cursor-pointer"
                      style={{ backgroundColor: role.color }}
                      onClick={() => {
                        const nextColor = defaultColors[(defaultColors.indexOf(role.color) + 1) % defaultColors.length]
                        updateRoleField(idx, 'color', nextColor)
                      }}
                    />
                    <input
                      value={role.displayName}
                      onChange={e => updateRoleField(idx, 'displayName', e.target.value)}
                      placeholder="显示名称（如：后端开发）"
                      className="flex-1 bg-transparent border-b border-dark-border text-sm py-1 outline-none focus:border-dark-accent"
                    />
                    <input
                      value={role.roleName}
                      onChange={e => updateRoleField(idx, 'roleName', e.target.value)}
                      placeholder="标识名 (backend)"
                      className="w-28 bg-transparent border-b border-dark-border text-xs text-gray-400 py-1 outline-none focus:border-dark-accent"
                    />
                    {roles.length > 1 && (
                      <button onClick={() => removeRole(idx)} className="text-gray-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <select
                    value={role.providerId}
                    onChange={e => updateRoleField(idx, 'providerId', e.target.value)}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex CLI</option>
                    <option value="gemini-cli">Gemini CLI</option>
                    <option value="opencode">OpenCode</option>
                  </select>

                  <textarea
                    value={role.systemPrompt}
                    onChange={e => updateRoleField(idx, 'systemPrompt', e.target.value)}
                    placeholder="角色系统提示词..."
                    rows={2}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1.5 text-xs outline-none resize-none focus:border-dark-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-border">
          <div>
            {isEditing && (
              <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
                删除模板
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-dark-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-40"
            >
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
