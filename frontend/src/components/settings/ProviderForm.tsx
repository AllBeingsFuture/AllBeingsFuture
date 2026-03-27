import React, { useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight,
  Terminal, Folder, TestTube, Loader2, RotateCcw, Save,
} from 'lucide-react'
import { ProviderService } from '../../../bindings/allbeingsfuture/internal/services'
import type { AIProvider } from '../../../bindings/allbeingsfuture/internal/models/models'
import type { AdapterType } from '../../types/models'

// ─── Constants (shared with ProviderManager) ───

export const ADAPTER_OPTIONS: { key: AdapterType; label: string }[] = [
  { key: 'claude-sdk', label: 'Claude Code SDK' },
  { key: 'codex-appserver', label: 'Codex App Server' },
  { key: 'gemini-headless', label: 'Gemini Headless' },
  { key: 'opencode-sdk', label: 'OpenCode SDK' },
  { key: 'openai-api', label: 'OpenAI \u517C\u5BB9 API' },
]

const inputCls = 'w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-md text-sm text-white placeholder-gray-500 outline-none focus:border-dark-accent/60 transition-colors'
const labelCls = 'block text-xs text-gray-400 mb-1.5'

// ─── Field wrapper ───

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

// ─── Edit Panel ───

export function EditPanel({
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

  const handleSave = async () => {
    setSaving(true)
    try {
      await ProviderService.Update(provider.id, {
        name: form.name,
        command: form.command,
        adapterType: form.adapterType,
        defaultModel: form.defaultModel,
        nodeVersion: form.nodeVersion,
        envOverrides: form.envOverrides,
        executablePath: form.executablePath,
        gitBashPath: form.gitBashPath,
        defaultArgs: form.defaultArgs,
        autoAcceptArg: form.autoAcceptArg,
        resumeArg: form.resumeArg,
        sessionIdPattern: form.sessionIdPattern,
        resumeFormat: form.resumeFormat,
        maxOutputTokens: form.maxOutputTokens,
        reasoningEffort: form.reasoningEffort,
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
            placeholder="Provider \u540D\u79F0"
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

      <Field label="Command / Path">
        <input
          value={form.command}
          onChange={e => set('command', e.target.value)}
          placeholder="e.g. claude, codex, gemini"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Default Model" hint="Specify model name, e.g. claude-sonnet-4-6">
          <input
            value={form.defaultModel || ''}
            onChange={e => set('defaultModel', e.target.value)}
            placeholder="Optional, e.g. claude-sonnet-4-6"
            className={inputCls}
          />
        </Field>
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
      </div>

      <Field label="Environment Overrides" hint="KEY=VALUE, one per line">
        <textarea
          value={form.envOverrides || ''}
          onChange={e => set('envOverrides', e.target.value)}
          placeholder="KEY=VALUE&#10;ANOTHER=VAL"
          rows={2}
          className={`${inputCls} resize-none font-mono`}
        />
      </Field>

      {/* Executable & Git Bash */}
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

          {/* Git Bash (Windows only) */}
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

export function AddProviderForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [adapterType, setAdapterType] = useState<AdapterType>('claude-sdk')

  const handleSave = async () => {
    if (!name || !command) return
    await ProviderService.Create(name, command, adapterType as any)
    onSave()
  }

  return (
    <div className="p-4 bg-dark-card rounded-lg border border-dark-accent/30 space-y-3">
      <h4 className="text-sm font-medium text-white">{'\u6DFB\u52A0\u81EA\u5B9A\u4E49 AI \u63D0\u4F9B\u8005'}</h4>

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

      <Field label="Command / Path">
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="e.g. my-ai-cli"
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name || !command}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-dark-accent text-white rounded-md hover:bg-blue-600 disabled:opacity-40 transition-colors"
        >
          <Plus size={12} /> {'\u6DFB\u52A0'}
        </button>
      </div>
    </div>
  )
}
