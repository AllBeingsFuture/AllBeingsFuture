import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import {
  Bot,
  Boxes,
  Edit3,
  Eye,
  EyeOff,
  LibraryBig,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { BotService } from '../../../bindings/allbeingsfuture/internal/services'
import {
  useBotStore,
  type BotCatalogItem,
  type BotCredentialField,
  type IMBot,
} from '../../stores/botStore'
import QQBotSettings from './QQBotSettings'
import QQOfficialSettings from './QQOfficialSettings'

type SourceFilter = 'all' | BotCatalogItem['source']
type EditorMode = 'create' | 'edit' | null

const SOURCE_ORDER: Array<Exclude<SourceFilter, 'all'>> = ['openclaw-ui', 'openclaw-extension', 'abf']

const SOURCE_LABELS: Record<Exclude<SourceFilter, 'all'>, string> = {
  'openclaw-ui': 'OpenClaw UI 卡片',
  'openclaw-extension': 'OpenClaw 扩展层',
  abf: 'ABF 兼容目录',
}

const SOURCE_TONES: Record<Exclude<SourceFilter, 'all'>, string> = {
  'openclaw-ui': 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
  'openclaw-extension': 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  abf: 'border-slate-400/30 bg-slate-500/10 text-slate-200',
}

const PLATFORM_SETTINGS: Record<string, { component: ComponentType; label: string }> = {
  onebot: { component: QQBotSettings, label: 'QQ Bot 高级设置（授权用户 / 授权群组）' },
  onebot_reverse: { component: QQBotSettings, label: 'QQ Bot 高级设置（授权用户 / 授权群组）' },
  qqbot: { component: QQOfficialSettings, label: 'QQ 官方机器人高级设置' },
}

function createEmptyBot(catalogItem: BotCatalogItem | null = null): IMBot {
  return {
    id: '',
    type: catalogItem?.type ?? 'telegram',
    name: catalogItem?.label ?? '',
    agent_profile_id: 'default',
    enabled: true,
    credentials: {},
    config: { credentials: {}, agent_profile_id: 'default' },
    catalog: catalogItem,
  }
}

function cloneBot(bot: IMBot): IMBot {
  return {
    ...bot,
    credentials: { ...bot.credentials },
    config: {
      ...bot.config,
      credentials: { ...bot.credentials },
      agent_profile_id: bot.agent_profile_id,
    },
  }
}

function humanizeKey(key: string): string {
  return key
    .split(/[_-]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getFieldList(bot: IMBot, catalogItem: BotCatalogItem | null): BotCredentialField[] {
  if (catalogItem?.fields?.length) return catalogItem.fields
  return Object.keys(bot.credentials).map(key => ({ key, label: humanizeKey(key) }))
}

function isMultilineField(field: BotCredentialField): boolean {
  return /(json|cookie|relay|channels|private_key|public_key)/i.test(field.key)
}

export default function BotManagementTab() {
  const { bots, catalog, loading, catalogLoading, load, create, update, remove, toggle } = useBotStore(
    useShallow((state) => ({
      bots: state.bots,
      catalog: state.catalog,
      loading: state.loading,
      catalogLoading: state.catalogLoading,
      load: state.load,
      create: state.create,
      update: state.update,
      remove: state.remove,
      toggle: state.toggle,
    })),
  )

  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [selectedCatalogType, setSelectedCatalogType] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [editingBot, setEditingBot] = useState<IMBot>(createEmptyBot())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [testPushState, setTestPushState] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'error'>>({})
  const [testPushError, setTestPushError] = useState<Record<string, string>>({})

  const query = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedCatalogType && catalog.length > 0) {
      setSelectedCatalogType(catalog[0].type)
    }
  }, [catalog, selectedCatalogType])

  const selectedCatalog = catalog.find(item => item.type === (editorMode ? editingBot.type : selectedCatalogType)) ?? null
  const editorFields = getFieldList(editingBot, selectedCatalog)
  const editorSettings = PLATFORM_SETTINGS[editingBot.type] ?? null
  const enabledCount = bots.filter(bot => bot.enabled).length

  const instancesByType = new Map<string, IMBot[]>()
  for (const bot of bots) {
    const list = instancesByType.get(bot.type) ?? []
    list.push(bot)
    instancesByType.set(bot.type, list)
  }

  const visibleCatalog = catalog.filter((item) => {
    if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
    if (!query) return true
    return [item.label, item.type, item.category, item.description].some(text => text.toLowerCase().includes(query))
  })

  const visibleBots = bots.filter((bot) => {
    if (sourceFilter !== 'all' && bot.catalog?.source !== sourceFilter) return false
    if (!query) return true
    return [bot.name, bot.id, bot.type, bot.catalog?.label ?? ''].some(text => text.toLowerCase().includes(query))
  })

  const openCreate = (catalogItem: BotCatalogItem) => {
    startTransition(() => {
      setSelectedCatalogType(catalogItem.type)
      setEditorMode('create')
      setEditingBot(createEmptyBot(catalogItem))
      setRevealedSecrets(new Set())
    })
  }

  const openEdit = (bot: IMBot) => {
    startTransition(() => {
      setSelectedCatalogType(bot.type)
      setEditorMode('edit')
      setEditingBot(cloneBot(bot))
      setRevealedSecrets(new Set())
    })
  }

  const closeEditor = () => {
    setEditorMode(null)
    setRevealedSecrets(new Set())
  }

  const updateEditingBot = (updater: (prev: IMBot) => IMBot) => {
    setEditingBot((prev) => {
      const next = updater(prev)
      return {
        ...next,
        config: {
          ...next.config,
          credentials: { ...next.credentials },
          agent_profile_id: next.agent_profile_id || 'default',
        },
      }
    })
  }

  const updateCredential = (key: string, value: string) => {
    updateEditingBot(prev => ({
      ...prev,
      credentials: { ...prev.credentials, [key]: value },
    }))
  }

  const handleSave = async () => {
    const nextId = editingBot.id.trim()
    if (editorMode === 'create' && !nextId) return

    setSaving(true)
    try {
      const credentials = Object.fromEntries(
        Object.entries(editingBot.credentials).filter(([, value]) => value !== ''),
      )
      const payload: IMBot = {
        ...editingBot,
        id: editorMode === 'create' ? nextId : editingBot.id,
        agent_profile_id: editingBot.agent_profile_id.trim() || 'default',
        credentials,
        config: {
          ...editingBot.config,
          credentials,
          agent_profile_id: editingBot.agent_profile_id.trim() || 'default',
        },
        catalog: selectedCatalog,
      }
      if (editorMode === 'create') await create(payload)
      if (editorMode === 'edit') await update(editingBot.id, payload)
      closeEditor()
    } catch (error) {
      console.error('Failed to save bot:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleTestPush = async (bot: IMBot) => {
    setTestPushState(state => ({ ...state, [bot.id]: 'sending' }))
    setTestPushError(state => ({ ...state, [bot.id]: '' }))
    try {
      const result = await BotService.TestPush(bot.id)
      setTestPushState(state => ({ ...state, [bot.id]: result.ok ? 'ok' : 'error' }))
      if (!result.ok) setTestPushError(state => ({ ...state, [bot.id]: result.error ?? '未知错误' }))
    } catch {
      setTestPushState(state => ({ ...state, [bot.id]: 'error' }))
      setTestPushError(state => ({ ...state, [bot.id]: '推送请求失败' }))
    }
    setTimeout(() => setTestPushState(state => ({ ...state, [bot.id]: 'idle' })), 4000)
  }

  const handleDelete = async (botId: string) => {
    try {
      await remove(botId)
      setConfirmDeleteId(null)
      if (editorMode === 'edit' && editingBot.id === botId) {
        closeEditor()
      }
    } catch (error) {
      console.error('Failed to delete bot:', error)
    }
  }

  const handleToggle = async (bot: IMBot) => {
    try {
      await toggle(bot.id, !bot.enabled)
    } catch (error) {
      console.error('Failed to toggle bot:', error)
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(251,146,60,0.14),_transparent_38%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.98))]">
        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-200">
              <LibraryBig size={13} />
              OpenClaw Catalog
            </div>
            <h4 className="mt-3 text-lg font-semibold text-white">多渠道 Bot 控制中心</h4>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              统一管理 OpenClaw 渠道目录、ABF 历史 Bot 实例、测试推送入口和旧高级设置。
              Telegram 现已支持基础远程控制，其他渠道仍以配置与推送接入为主。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || catalogLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
            >
              {loading || catalogLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              刷新
            </button>
            <button
              type="button"
              onClick={() => selectedCatalog && openCreate(selectedCatalog)}
              disabled={!selectedCatalog}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
            >
              <Plus size={15} />
              新建实例
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-white/10 px-5 py-4 md:grid-cols-3">
          <StatCard label="已配置实例" value={String(bots.length)} hint="数据库中的 Bot 条目" icon={<Bot size={15} />} />
          <StatCard label="启用中" value={String(enabledCount)} hint="当前 enabled 状态实例" icon={<Boxes size={15} />} />
          <StatCard label="渠道目录" value={String(catalog.length)} hint="OpenClaw + ABF 合并视图" icon={<LibraryBig size={15} />} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h5 className="text-sm font-semibold text-white">实例列表</h5>
                <p className="mt-1 text-xs text-slate-400">可以直接编辑、开关、测试推送或删除已有实例。</p>
              </div>

              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索实例或渠道…"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 py-3">
              {(['all', ...SOURCE_ORDER] as SourceFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSourceFilter(option)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs transition',
                    sourceFilter === option
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white',
                  ].join(' ')}
                >
                  {option === 'all' ? '全部来源' : SOURCE_LABELS[option]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
              {visibleBots.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
                  {bots.length === 0 ? '还没有 Bot 实例，从下方目录创建一个。' : '当前筛选条件下没有匹配实例。'}
                </div>
              ) : visibleBots.map((bot) => (
                <article key={bot.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-200">
                          <Bot size={15} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{bot.name || bot.id}</p>
                          <p className="text-[11px] text-slate-500">{bot.id}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${bot.catalog ? SOURCE_TONES[bot.catalog.source] : 'border-white/10 bg-white/5 text-slate-300'}`}>
                          {bot.catalog?.label || bot.type}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                          {bot.enabled ? '已启用' : '已停用'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggle(bot)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${bot.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-300'}`}
                    >
                      {bot.enabled ? '停用' : '启用'}
                    </button>
                  </div>

                  <p className="mt-3 min-h-[40px] text-xs leading-5 text-slate-400">
                    {bot.catalog?.description || '当前实例来自历史配置，目录元数据不完整。'}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEdit(bot)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300">
                      <Edit3 size={12} />
                      编辑
                    </button>
                    {bot.catalog?.supportsTestPush ? (
                      <button
                        type="button"
                        onClick={() => void handleTestPush(bot)}
                        disabled={testPushState[bot.id] === 'sending'}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-60"
                      >
                        {testPushState[bot.id] === 'sending' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        {testPushState[bot.id] === 'ok' ? '已发送' : testPushState[bot.id] === 'error' ? '失败' : '测试推送'}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setConfirmDeleteId(bot.id)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-red-300">
                      <Trash2 size={12} />
                      删除
                    </button>
                  </div>

                  {testPushState[bot.id] === 'error' && testPushError[bot.id] ? (
                    <p className="mt-2 text-[11px] text-red-300">{testPushError[bot.id]}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 px-5 py-5">
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-white">渠道目录</h5>
              <p className="mt-1 text-xs text-slate-400">按来源整理 OpenClaw / ABF 的可配置渠道。</p>
            </div>

            <div className="space-y-4">
              {SOURCE_ORDER.map((source) => {
                const items = visibleCatalog.filter(item => item.source === source)
                if (items.length === 0) return null
                return (
                  <div key={source} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{SOURCE_LABELS[source]}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${SOURCE_TONES[source]}`}>{items.length} 项</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {items.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setSelectedCatalogType(item.type)}
                          className={[
                            'rounded-2xl border p-4 text-left transition',
                            selectedCatalogType === item.type && editorMode === null
                              ? 'border-cyan-400/40 bg-cyan-500/10'
                              : 'border-white/10 bg-slate-900/70 hover:border-white/20',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{item.label}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.type}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                              {instancesByType.get(item.type)?.length ?? 0} 个实例
                            </span>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-slate-400">{item.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-slate-950/80">
          {editorMode ? (
            <div>
              <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">{editorMode === 'create' ? '创建实例' : '编辑实例'}</p>
                  <p className="mt-1 text-xs text-slate-400">{selectedCatalog?.label || editingBot.type}</p>
                </div>
                <button type="button" onClick={closeEditor} className="rounded-xl border border-white/10 p-2 text-slate-400">
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">Bot ID</span>
                  <input
                    value={editingBot.id}
                    onChange={(event) => updateEditingBot(prev => ({ ...prev, id: event.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase() }))}
                    disabled={editorMode === 'edit'}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white disabled:opacity-60"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">显示名称</span>
                  <input
                    value={editingBot.name}
                    onChange={(event) => updateEditingBot(prev => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">Agent Profile ID</span>
                  <input
                    value={editingBot.agent_profile_id}
                    onChange={(event) => updateEditingBot(prev => ({ ...prev, agent_profile_id: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">启用</span>
                  <button
                    type="button"
                    onClick={() => updateEditingBot(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative h-6 w-11 rounded-full ${editingBot.enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${editingBot.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>

                {editorFields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-300">{field.label}</span>
                    <div className="flex gap-2">
                      {isMultilineField(field) ? (
                        <textarea
                          value={String(editingBot.credentials[field.key] ?? '')}
                          onChange={(event) => updateCredential(field.key, event.target.value)}
                          rows={3}
                          className="min-h-[88px] flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white"
                        />
                      ) : (
                        <input
                          type={field.secret && !revealedSecrets.has(field.key) ? 'password' : 'text'}
                          value={String(editingBot.credentials[field.key] ?? '')}
                          onChange={(event) => updateCredential(field.key, event.target.value)}
                          className="flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white"
                        />
                      )}
                      {field.secret ? (
                        <button
                          type="button"
                          onClick={() => setRevealedSecrets((prev) => {
                            const next = new Set(prev)
                            if (next.has(field.key)) next.delete(field.key)
                            else next.add(field.key)
                            return next
                          })}
                          className="rounded-2xl border border-white/10 px-3 text-slate-400"
                        >
                          {revealedSecrets.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      ) : null}
                    </div>
                    {field.hint ? <p className="mt-1 text-[11px] text-slate-500">{field.hint}</p> : null}
                  </label>
                ))}

                {editorSettings ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
                    <p className="mb-3 text-xs font-medium text-slate-300">{editorSettings.label}</p>
                    <editorSettings.component />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
                <button type="button" onClick={closeEditor} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-300">取消</button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || (editorMode === 'create' && !editingBot.id.trim())}
                  className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
                >
                  {saving ? '保存中…' : editorMode === 'create' ? '创建实例' : '保存修改'}
                </button>
              </div>
            </div>
          ) : selectedCatalog ? (
            <div className="space-y-4 px-5 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h5 className="text-sm font-semibold text-white">{selectedCatalog.label}</h5>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SOURCE_TONES[selectedCatalog.source]}`}>{SOURCE_LABELS[selectedCatalog.source]}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{selectedCatalog.description}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">
                <p>渠道 ID：{selectedCatalog.type}</p>
                <p>分类：{selectedCatalog.category}</p>
                <p>当前实例：{instancesByType.get(selectedCatalog.type)?.length ?? 0}</p>
                <p>字段数：{selectedCatalog.fields.length}</p>
              </div>

              <button
                type="button"
                onClick={() => openCreate(selectedCatalog)}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950"
              >
                <Plus size={15} />
                基于此渠道创建实例
              </button>
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              从左侧目录选择一个渠道，右侧会显示详情和创建入口。
            </div>
          )}
        </aside>
      </div>

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-[340px] rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <p className="text-sm font-semibold text-white">确认删除这个 Bot 实例？</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">只会删除本地配置，不会自动撤销第三方平台资源。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-300">取消</button>
              <button type="button" onClick={() => void handleDelete(confirmDeleteId)} className="rounded-2xl bg-red-500 px-4 py-2 text-sm font-medium text-white">删除实例</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <span className="text-cyan-200">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}
