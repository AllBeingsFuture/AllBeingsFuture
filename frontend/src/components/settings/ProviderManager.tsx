import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, GripVertical, Pencil, ChevronDown, ChevronRight,
  Terminal, Folder, TestTube, Loader2, RotateCcw, Save,
} from 'lucide-react'
import { ProviderService } from '../../../bindings/allbeingsfuture/internal/services'
import type { AIProvider } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { AdapterType } from '../../types/models'

// ─── Constants ───

const ADAPTER_OPTIONS: { key: AdapterType; label: string }[] = [
  { key: 'claude-sdk', label: 'Claude Code SDK' },
  { key: 'codex-appserver', label: 'Codex App Server' },
  { key: 'gemini-headless', label: 'Gemini Headless' },
  { key: 'opencode-sdk', label: 'OpenCode SDK' },
  { key: 'openai-api', label: 'OpenAI 兼容 API' },
]

const ADAPTER_ICONS: Record<string, { icon: string; color: string }> = {
  'claude-sdk':      { icon: '>', color: '#58A6FF' },
  'codex-appserver': { icon: '</>', color: '#F97316' },
  'gemini-headless': { icon: '✦', color: '#34D399' },
  'opencode-sdk':    { icon: '⚡', color: '#FB923C' },
  'openai-api':      { icon: '◉', color: '#10B981' },
}

const ADAPTER_CAPABILITIES: Record<string, string[]> = {
  'claude-sdk':      ['可恢复', '可自动接受', '会话追踪', '确认检测'],
  'codex-appserver': ['可恢复', '可自动接受', '确认检测'],
  'gemini-headless': ['可自动接受', '确认检测'],
  'opencode-sdk':    ['可自动接受'],
  'openai-api':      ['API 兼容'],
}

const inputCls = 'w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-md text-sm text-white placeholder-gray-500 outline-none focus:border-dark-accent/60 transition-colors'
const labelCls = 'block text-xs text-gray-400 mb-1.5'

function buildOpenAiEnvOverrides(baseUrl: string, apiKey: string): string {
  const lines: string[] = []
  if (baseUrl.trim()) lines.push(`OPENAI_BASE_URL=${baseUrl.trim()}`)
  if (apiKey.trim()) lines.push(`OPENAI_API_KEY=${apiKey.trim()}`)
  return lines.join('\n')
}

// ─── Main Component ───

export default function ProviderManager() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    const data = await ProviderService.GetAll() ?? []
    setProviders(data)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此 Provider？')) return
    await ProviderService.Delete(id)
    await load()
  }

  const handleToggle = async (p: AIProvider) => {
    await ProviderService.Update(p.id, { isEnabled: p.isEnabled ? 0 : 1 })
    await load()
  }

  const handleEdit = (id: string) => {
    setEditingId(prev => prev === id ? null : id)
    setShowAddForm(false)
  }

  const handleSaveEdit = async () => {
    setEditingId(null)
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">管理可用的 AI 提供者。内置 Provider 不可删除。</p>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null) }}
          className="text-xs text-dark-accent hover:text-blue-400 flex items-center gap-1 transition-colors"
        >
          <Plus size={14} /> 添加 Provider
        </button>
      </div>

      <div className="space-y-2">
        {providers.map(p => (
          <ProviderCard
            key={p.id}
            provider={p}
            isEditing={editingId === p.id}
            onToggle={() => handleToggle(p)}
            onEdit={() => handleEdit(p.id)}
            onDelete={() => handleDelete(p.id)}
            onSave={handleSaveEdit}
            onCancel={() => setEditingId(null)}
          />
        ))}
      </div>

      {showAddForm && (
        <AddProviderForm
          onSave={async () => { setShowAddForm(false); await load() }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}

// ─── Provider Card ───

function ProviderCard({
  provider: p,
  isEditing,
  onToggle,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: {
  provider: AIProvider
  isEditing: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const iconInfo = ADAPTER_ICONS[p.adapterType] ?? { icon: '?', color: '#6B7280' }
  const capabilities = ADAPTER_CAPABILITIES[p.adapterType] ?? []

  return (
    <div
      className={`rounded-lg border transition-all ${
        isEditing
          ? 'border-dark-accent/40 bg-dark-card'
          : 'border-dark-border bg-dark-bg hover:border-dark-border/80'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 group">
        <GripVertical size={14} className="text-gray-600 cursor-grab shrink-0" />

        {/* Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: iconInfo.color + '20', color: iconInfo.color }}
        >
          {iconInfo.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{p.name}</span>
            {p.isBuiltin && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-medium">
                内置
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <code className="text-xs text-gray-500">{p.command || p.adapterType}</code>
            {p.defaultModel && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-xs text-gray-500">{p.defaultModel}</span>
              </>
            )}
          </div>
        </div>

        {/* Capability badges */}
        <div className="hidden lg:flex items-center gap-1.5 mr-2">
          {capabilities.map(cap => (
            <span
              key={cap}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 whitespace-nowrap"
            >
              {cap}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            title="编辑"
          >
            <Pencil size={14} />
          </button>

          {!p.isBuiltin && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-400/5 opacity-0 group-hover:opacity-100 transition-all"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Toggle */}
          <button
            onClick={onToggle}
            className={`w-9 h-5 rounded-full transition-colors relative ml-1 ${
              p.isEnabled ? 'bg-dark-accent' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                p.isEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {isEditing && (
        <EditPanel provider={p} onSave={onSave} onCancel={onCancel} />
      )}
    </div>
  )
}

// ─── Edit Panel ───

function EditPanel({
  provider,
  onSave,
  onCancel,
}: {
  provider: AIProvider
  onSave: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(() => ({ ...provider }))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const hasChanges = JSON.stringify(form) !== JSON.stringify(provider)
  const isApiProvider = form.adapterType === 'openai-api'

  const handleSave = async () => {
    setSaving(true)
    try {
      await ProviderService.Update(provider.id, {
        name: form.name,
        command: isApiProvider ? '' : form.command,
        adapterType: form.adapterType,
        defaultModel: form.defaultModel,
        nodeVersion: isApiProvider ? '' : form.nodeVersion,
        envOverrides: form.envOverrides,
        executablePath: isApiProvider ? '' : form.executablePath,
        gitBashPath: isApiProvider ? '' : form.gitBashPath,
        defaultArgs: isApiProvider ? '' : form.defaultArgs,
        autoAcceptArg: isApiProvider ? '' : form.autoAcceptArg,
        resumeArg: isApiProvider ? '' : form.resumeArg,
        sessionIdPattern: isApiProvider ? '' : form.sessionIdPattern,
        resumeFormat: isApiProvider ? '' : form.resumeFormat,
        maxOutputTokens: form.maxOutputTokens,
        reasoningEffort: form.reasoningEffort,
        preferResponsesApi: form.preferResponsesApi,
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const pathToTest = form.executablePath || form.command
      const result = await (window as any).electron?.invoke?.('ProviderService.TestExecutable', provider.id, pathToTest)
      setTestResult(result ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  const handleReset = () => setForm({ ...provider })

  return (
    <div className="px-4 pb-4 space-y-4 border-t border-dark-border/50 pt-3 mt-0">
      {/* Basic settings */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Provider 名称"
            className={inputCls}
          />
        </Field>
        <Field label="Adapter Type">
          <select
            value={form.adapterType}
            onChange={e => set('adapterType', e.target.value as AdapterType)}
            className={inputCls}
          >
            {ADAPTER_OPTIONS.map(a => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {!isApiProvider && (
        <Field label="Command / Path">
          <input
            value={form.command}
            onChange={e => set('command', e.target.value)}
            placeholder="e.g. claude, codex, gemini"
            className={inputCls}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Default Model" hint={isApiProvider ? '例如 gpt-4o、deepseek-chat、qwen-max' : 'Specify model name, e.g. claude-sonnet-4-6'}>
          <input
            value={form.defaultModel || ''}
            onChange={e => set('defaultModel', e.target.value)}
            placeholder={isApiProvider ? 'Required for API providers' : 'Optional, e.g. claude-sonnet-4-6'}
            className={inputCls}
          />
        </Field>
        {!isApiProvider ? (
          <Field label="Node.js Version">
            <select
              value={form.nodeVersion || ''}
              onChange={e => set('nodeVersion', e.target.value)}
              className={inputCls}
            >
              <option value="">System Default</option>
              <option value="18">Node.js 18</option>
              <option value="20">Node.js 20</option>
              <option value="22">Node.js 22</option>
            </select>
          </Field>
        ) : (
          <Field label="API Mode" hint="OpenAI 兼容 Provider 通过 HTTP 请求访问，不依赖本地 CLI。">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
              已启用 API 直连模式
            </div>
          </Field>
        )}
      </div>

      <Field
        label="Environment Overrides"
        hint={isApiProvider
          ? '推荐至少配置 OPENAI_BASE_URL 和 OPENAI_API_KEY，一行一个。'
          : 'KEY=VALUE, one per line'}
      >
        <textarea
          value={form.envOverrides || ''}
          onChange={e => set('envOverrides', e.target.value)}
          placeholder={isApiProvider
            ? 'OPENAI_BASE_URL=https://api.openai.com/v1&#10;OPENAI_API_KEY=sk-...&#10;OPENAI_CUSTOM_HEADERS={\"X-Title\":\"ABF\"}'
            : 'KEY=VALUE&#10;ANOTHER=VAL'}
          rows={isApiProvider ? 4 : 2}
          className={`${inputCls} resize-none font-mono`}
        />
      </Field>

      {!isApiProvider && (
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-dark-border/50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Terminal size={13} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-300">
                Executable Path
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">
                {form.adapterType === 'claude-sdk' ? 'claude-sdk' : 'command'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={form.executablePath || ''}
                onChange={e => set('executablePath', e.target.value)}
                placeholder={form.adapterType === 'claude-sdk' ? 'Auto-detect if empty' : form.command || 'command'}
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={() => (window as any).electron?.invoke?.('app:selectFile').then((paths: string[]) => paths?.[0] && set('executablePath', paths[0]))}
                className="px-2.5 py-2 bg-dark-bg border border-dark-border rounded-md text-gray-400 hover:text-white hover:border-dark-accent/40 transition-colors"
                title="Browse"
              >
                <Folder size={14} />
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-2 bg-dark-bg border border-dark-border rounded-md text-gray-400 hover:text-white hover:border-dark-accent/40 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
                title="Test executable"
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube size={13} />}
                Test
              </button>
            </div>
            {testResult && (
              <div className={`text-xs px-2 py-1 rounded ${
                testResult === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {testResult === 'ok' ? 'Executable found and reachable' : 'Executable not found or not accessible'}
              </div>
            )}

            <div className="pt-2 border-t border-dark-border/30">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-300">Git Bash Path</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">Windows</span>
              </div>
              <input
                value={form.gitBashPath || ''}
                onChange={e => set('gitBashPath', e.target.value)}
                placeholder="e.g. C:\Program Files\Git\bin\bash.exe"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}

      {/* Advanced settings (collapsible) */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors w-full"
      >
        {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Advanced Settings</span>
        <div className="flex-1 border-t border-dark-border/30 ml-2" />
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-0">
          {!isApiProvider && (
            <>
              <Field label="Default Arguments" hint="Additional CLI flags passed on every invocation">
                <input
                  value={form.defaultArgs || ''}
                  onChange={e => set('defaultArgs', e.target.value)}
                  placeholder="e.g. --verbose --no-cache"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Auto-Accept Arg" hint="Flag to enable auto-accept mode">
                  <input
                    value={form.autoAcceptArg || ''}
                    onChange={e => set('autoAcceptArg', e.target.value)}
                    placeholder="e.g. --dangerously-skip-permissions"
                    className={inputCls}
                  />
                </Field>
                <Field label="Resume Arg" hint="Flag to resume a session">
                  <input
                    value={form.resumeArg || ''}
                    onChange={e => set('resumeArg', e.target.value)}
                    placeholder="e.g. --resume"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Session ID Pattern" hint="Regex to extract session ID from output">
                  <input
                    value={form.sessionIdPattern || ''}
                    onChange={e => set('sessionIdPattern', e.target.value)}
                    placeholder="e.g. session_id:\\s*(.+)"
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label="Resume Format" hint="Template for resume command">
                  <input
                    value={form.resumeFormat || ''}
                    onChange={e => set('resumeFormat', e.target.value)}
                    placeholder="e.g. --resume {sessionId}"
                    className={`${inputCls} font-mono`}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Output Tokens">
              <input
                type="number"
                value={form.maxOutputTokens || ''}
                onChange={e => set('maxOutputTokens', parseInt(e.target.value) || 0)}
                placeholder="0 = unlimited"
                className={inputCls}
              />
            </Field>
            <Field label="Reasoning Effort">
              <select
                value={form.reasoningEffort || ''}
                onChange={e => set('reasoningEffort', e.target.value)}
                className={inputCls}
              >
                <option value="">Default</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-dark-border/30">
        <button
          onClick={handleReset}
          disabled={!hasChanges}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-dark-accent text-white rounded-md hover:bg-blue-600 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Provider Form ───

function AddProviderForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [adapterType, setAdapterType] = useState<AdapterType>('claude-sdk')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const isApiProvider = adapterType === 'openai-api'

  const handleSave = async () => {
    if (!name || (!isApiProvider && !command) || (isApiProvider && !defaultModel.trim())) return

    const created = await ProviderService.Create(name, isApiProvider ? '' : command, adapterType as any)
    if (created && isApiProvider) {
      await ProviderService.Update(created.id, {
        defaultModel: defaultModel.trim(),
        envOverrides: buildOpenAiEnvOverrides(baseUrl, apiKey),
      })
    }
    onSave()
  }

  return (
    <div className="p-4 bg-dark-card rounded-lg border border-dark-accent/30 space-y-3">
      <h4 className="text-sm font-medium text-white">添加自定义 AI 提供者</h4>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Provider"
            className={inputCls}
          />
        </Field>
        <Field label="Adapter Type">
          <select
            value={adapterType}
            onChange={e => setAdapterType(e.target.value as AdapterType)}
            className={inputCls}
          >
            {ADAPTER_OPTIONS.map(a => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {!isApiProvider ? (
        <Field label="Command / Path">
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="e.g. my-ai-cli"
            className={inputCls}
          />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base URL" hint="填写兼容服务的 API 根路径，默认官方 OpenAI。">
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </Field>
            <Field label="Default Model" hint="新会话默认使用的模型名。">
              <input
                value={defaultModel}
                onChange={e => setDefaultModel(e.target.value)}
                placeholder="e.g. gpt-4o-mini"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="API Key" hint="保存后会自动写入 OPENAI_API_KEY；留空则稍后在编辑面板补充。">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={inputCls}
            />
          </Field>
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name || (!isApiProvider && !command) || (isApiProvider && !defaultModel.trim())}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-dark-accent text-white rounded-md hover:bg-blue-600 disabled:opacity-40 transition-colors"
        >
          <Plus size={12} /> 添加
        </button>
      </div>
    </div>
  )
}

// ─── Field wrapper ───

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}
