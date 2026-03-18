import { useState, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react'
import { ProviderService } from '../../../bindings/allbeingsfuture/internal/services'
import type { AIProvider } from '../../../bindings/allbeingsfuture/internal/models/models'

const adapterLabels: Record<string, string> = {
  'claude-sdk': 'Claude SDK',
  'codex-appserver': 'Codex AppServer',
  'gemini-headless': 'Gemini Headless',
  'opencode-sdk': 'OpenCode SDK',
  'openai-api': 'OpenAI 兼容 API',
}

export default function ProviderManager() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const load = async () => {
    const data = await ProviderService.GetAll() ?? []
    setProviders(data)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此 Provider？')) return
    await ProviderService.Delete(id)
    await load()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await ProviderService.Update(id, { isEnabled: enabled ? 1 : 0 })
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">管理可用的 AI 提供者。内置 Provider 不可删除。</p>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-xs text-dark-accent hover:text-blue-400 flex items-center gap-1"
        >
          <Plus size={14} /> 添加 Provider
        </button>
      </div>

      <div className="space-y-2">
        {providers.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-4 py-3 bg-dark-bg rounded-lg border border-dark-border group"
          >
            <GripVertical size={14} className="text-gray-600 cursor-grab" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                {p.isBuiltin && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">内置</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {adapterLabels[p.adapterType] ?? p.adapterType} · <code>{p.command}</code>
              </div>
            </div>

            {/* Toggle */}
            <button
              onClick={() => handleToggle(p.id, !p.isEnabled)}
              className={`w-8 h-4.5 rounded-full transition-colors relative ${p.isEnabled ? 'bg-dark-accent' : 'bg-gray-600'}`}
            >
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${p.isEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>

            {/* Delete (non-builtin only) */}
            {!p.isBuiltin && (
              <button
                onClick={() => handleDelete(p.id)}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddProviderForm
          onSave={async () => { setShowAddForm(false); await load() }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}

function AddProviderForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [adapterType, setAdapterType] = useState<string>('claude-sdk')

  const handleSave = async () => {
    if (!name || !command) return
    await ProviderService.Create(name, command, adapterType as any)
    onSave()
  }

  return (
    <div className="p-4 bg-dark-bg rounded-lg border border-dark-accent/30 space-y-3">
      <h4 className="text-sm font-medium">添加 AI Provider</h4>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Provider"
            className="w-full px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs outline-none focus:border-dark-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">命令</label>
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="my-cli"
            className="w-full px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs outline-none focus:border-dark-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">适配器类型</label>
        <select
          value={adapterType}
          onChange={e => setAdapterType(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-dark-card border border-dark-border rounded text-xs outline-none"
        >
          {Object.entries(adapterLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">
          <X size={14} className="inline mr-1" /> 取消
        </button>
        <button
          onClick={handleSave}
          disabled={!name || !command}
          className="px-3 py-1.5 text-xs bg-dark-accent text-white rounded hover:bg-blue-600 disabled:opacity-40"
        >
          <Check size={14} className="inline mr-1" /> 保存
        </button>
      </div>
    </div>
  )
}
