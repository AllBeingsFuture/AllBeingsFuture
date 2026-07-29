/**
 * Chat-side capability panel — browse / toggle MCP servers or Skills
 * next to the conversation composer. Original UI for this codebase.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Loader2,
  Plus,
  Search,
  Server,
  Sparkles,
  X,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useMcpStore, type MCPServer } from '../../stores/mcpStore'
import { useSkillStore, type Skill } from '../../stores/skillStore'
import { countEnabled } from './capabilityUtils'

export type CapabilityKind = 'skills' | 'mcp'

interface CapabilityPickerProps {
  kind: CapabilityKind
  open: boolean
  onClose: () => void
  /** Anchor: panel opens above this area (composer-relative). */
  className?: string
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={checked ? '点击禁用' : '点击启用'}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function RowShell({
  icon,
  title,
  subtitle,
  badges,
  trailing,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  badges?: ReactNode
  trailing: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition hover:bg-white/[0.04]">
      <div className="mt-0.5 shrink-0 text-blue-400/90">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-gray-100">{title}</span>
          {badges}
        </div>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{trailing}</div>
    </div>
  )
}

function SkillRows({
  skills,
  query,
  busyId,
  onToggle,
}: {
  skills: Skill[]
  query: string
  busyId: string | null
  onToggle: (id: string, enabled: boolean) => void
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter((s) => {
      const hay = `${s.name} ${s.description} ${s.slashCommand || ''} ${s.category}`.toLowerCase()
      return hay.includes(q)
    })
  }, [skills, query])

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-gray-500">
        没有匹配的技能
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {filtered.map((skill) => (
        <RowShell
          key={skill.id}
          icon={<Sparkles size={14} />}
          title={skill.name}
          subtitle={skill.description || undefined}
          badges={
            skill.slashCommand ? (
              <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">
                /{skill.slashCommand}
              </span>
            ) : null
          }
          trailing={
            <ToggleSwitch
              checked={skill.enabled}
              disabled={busyId === skill.id}
              label={`${skill.enabled ? '禁用' : '启用'}技能 ${skill.name}`}
              onChange={() => onToggle(skill.id, !skill.enabled)}
            />
          }
        />
      ))}
    </div>
  )
}

function McpRows({
  servers,
  query,
  busyId,
  onToggle,
}: {
  servers: MCPServer[]
  query: string
  busyId: string | null
  onToggle: (id: string, enabled: boolean) => void
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return servers
    return servers.filter((s) => {
      const hay = `${s.name} ${s.description} ${s.category} ${s.command}`.toLowerCase()
      return hay.includes(q)
    })
  }, [servers, query])

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-gray-500">
        没有匹配的 MCP 服务
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {filtered.map((server) => (
        <RowShell
          key={server.id}
          icon={<Server size={14} />}
          title={server.name}
          subtitle={server.description || undefined}
          badges={
            <>
              <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
                {server.transport || 'stdio'}
              </span>
              {!server.isInstalled ? (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                  需依赖
                </span>
              ) : null}
            </>
          }
          trailing={
            <ToggleSwitch
              checked={server.enabled}
              disabled={busyId === server.id}
              label={`${server.enabled ? '禁用' : '启用'} MCP ${server.name}`}
              onChange={() => onToggle(server.id, !server.enabled)}
            />
          }
        />
      ))}
    </div>
  )
}

function CustomMcpForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (data: { name: string; command: string; args: string; description: string }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [description, setDescription] = useState('')

  return (
    <form
      className="space-y-2 rounded-lg border border-white/10 bg-[#0d1420] p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !command.trim()) return
        onSubmit({ name: name.trim(), command: command.trim(), args, description: description.trim() })
      }}
    >
      <p className="text-xs font-medium text-gray-200">添加自定义 MCP</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
        required
      />
      <input
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="启动命令，例如 npx"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
        required
      />
      <input
        value={args}
        onChange={(e) => setArgs(e.target.value)}
        placeholder="参数（空格分隔，可选）"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="描述（可选）"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !command.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-500/90 px-2.5 py-1 text-xs text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
          安装并启用
        </button>
      </div>
    </form>
  )
}

function CustomSkillForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (data: {
    name: string
    slashCommand: string
    description: string
    promptTemplate: string
  }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [slashCommand, setSlashCommand] = useState('')
  const [description, setDescription] = useState('')
  const [promptTemplate, setPromptTemplate] = useState('')

  return (
    <form
      className="space-y-2 rounded-lg border border-white/10 bg-[#0d1420] p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !promptTemplate.trim()) return
        onSubmit({
          name: name.trim(),
          slashCommand: slashCommand.trim().replace(/^\//, ''),
          description: description.trim(),
          promptTemplate: promptTemplate.trim(),
        })
      }}
    >
      <p className="text-xs font-medium text-gray-200">添加自定义技能</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
        required
      />
      <input
        value={slashCommand}
        onChange={(e) => setSlashCommand(e.target.value)}
        placeholder="斜杠命令（不含 /，可选）"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="描述（可选）"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
      />
      <textarea
        value={promptTemplate}
        onChange={(e) => setPromptTemplate(e.target.value)}
        placeholder="技能提示词模板（必填）"
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-blue-500/40"
        required
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !promptTemplate.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-500/90 px-2.5 py-1 text-xs text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
          安装并启用
        </button>
      </div>
    </form>
  )
}

export default function CapabilityPicker({
  kind,
  open,
  onClose,
  className = '',
}: CapabilityPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const skillState = useSkillStore(useShallow((s) => ({
    skills: s.skills,
    loading: s.loading,
    load: s.load,
    toggleEnabled: s.toggleEnabled,
    install: s.install,
  })))

  const mcpState = useMcpStore(useShallow((s) => ({
    servers: s.servers,
    loading: s.loading,
    load: s.load,
    toggleEnabled: s.toggleEnabled,
    install: s.install,
  })))

  const loading = kind === 'skills' ? skillState.loading : mcpState.loading
  const items = kind === 'skills' ? skillState.skills : mcpState.servers
  const enabledCount = countEnabled(items)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setShowAdd(false)
    setError(null)
    if (kind === 'skills') {
      void skillState.load()
    } else {
      void mcpState.load()
    }
  }, [open, kind]) // eslint-disable-line react-hooks/exhaustive-deps -- load on open only

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose])

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    setBusyId(id)
    setError(null)
    try {
      if (kind === 'skills') {
        await skillState.toggleEnabled(id, enabled)
      } else {
        await mcpState.toggleEnabled(id, enabled)
      }
    } catch (err: any) {
      setError(err?.message || '切换失败')
    } finally {
      setBusyId(null)
    }
  }, [kind, skillState, mcpState])

  const handleInstallMcp = useCallback(async (data: {
    name: string
    command: string
    args: string
    description: string
  }) => {
    setInstalling(true)
    setError(null)
    try {
      const argList = data.args
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      await mcpState.install({
        id: '',
        name: data.name,
        description: data.description,
        category: 'custom',
        command: data.command,
        args: argList,
        transport: 'stdio',
        source: 'custom',
        enabled: true,
        isInstalled: true,
        toolCount: 0,
        hasInstructions: false,
        removable: true,
      })
      setShowAdd(false)
    } catch (err: any) {
      setError(err?.message || '安装失败')
    } finally {
      setInstalling(false)
    }
  }, [mcpState])

  const handleInstallSkill = useCallback(async (data: {
    name: string
    slashCommand: string
    description: string
    promptTemplate: string
  }) => {
    setInstalling(true)
    setError(null)
    try {
      await skillState.install({
        name: data.name,
        description: data.description,
        category: 'custom',
        type: 'prompt',
        source: 'custom',
        slashCommand: data.slashCommand,
        promptTemplate: data.promptTemplate,
        content: data.promptTemplate,
      })
      setShowAdd(false)
    } catch (err: any) {
      setError(err?.message || '安装失败')
    } finally {
      setInstalling(false)
    }
  }, [skillState])

  if (!open) return null

  const title = kind === 'skills' ? '技能' : 'MCP'
  const Icon = kind === 'skills' ? Sparkles : Server

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${title} 选择面板`}
      data-testid={`capability-picker-${kind}`}
      className={`absolute bottom-full left-0 z-30 mb-2 w-[min(100%,380px)] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0c121c] shadow-[0_16px_48px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <Icon size={14} className="text-blue-400" />
        <span className="text-sm font-medium text-gray-100">{title}</span>
        <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
          已启用 {enabledCount}/{items.length}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
          aria-label={kind === 'skills' ? '添加自定义技能' : '添加自定义 MCP'}
        >
          <Plus size={12} />
          添加
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-500 transition hover:bg-white/5 hover:text-gray-200"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>

      <div className="border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5">
          <Search size={12} className="shrink-0 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={kind === 'skills' ? '搜索技能…' : '搜索 MCP…'}
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-100 outline-none placeholder:text-gray-600"
            autoFocus
          />
          {loading ? <Loader2 size={12} className="animate-spin text-gray-500" /> : null}
        </div>
      </div>

      <div className="max-h-[280px] space-y-2 overflow-y-auto px-2.5 py-2">
        {showAdd ? (
          kind === 'skills' ? (
            <CustomSkillForm
              submitting={installing}
              onCancel={() => setShowAdd(false)}
              onSubmit={(data) => void handleInstallSkill(data)}
            />
          ) : (
            <CustomMcpForm
              submitting={installing}
              onCancel={() => setShowAdd(false)}
              onSubmit={(data) => void handleInstallMcp(data)}
            />
          )
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
            {error}
          </div>
        ) : null}

        {kind === 'skills' ? (
          <SkillRows
            skills={skillState.skills}
            query={query}
            busyId={busyId}
            onToggle={(id, enabled) => void handleToggle(id, enabled)}
          />
        ) : (
          <McpRows
            servers={mcpState.servers}
            query={query}
            busyId={busyId}
            onToggle={(id, enabled) => void handleToggle(id, enabled)}
          />
        )}
      </div>

      <div className="border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-gray-600">
        {kind === 'mcp'
          ? '启用状态写入全局配置；新会话启动时注入 MCP。已在运行的会话需重新初始化后才会生效。'
          : '启用状态写入全局配置；下一条消息会按当前启用技能展开 / 命令。'}
      </div>
    </div>
  )
}
