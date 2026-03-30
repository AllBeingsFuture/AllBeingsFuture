import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { Bot, ChevronDown, Edit3, Eye, EyeOff, Loader2, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useBotStore, type IMBot } from '../../stores/botStore'
import { BotService } from '../../../bindings/allbeingsfuture/internal/services'

const QQBotSettings = lazy(() => import('./QQBotSettings'))
const QQOfficialSettings = lazy(() => import('./QQOfficialSettings'))

// ─── Bot type definitions ────────────────────────────────────────────────

const BOT_TYPES = ['telegram', 'feishu', 'dingtalk', 'wework', 'wework_ws', 'onebot', 'onebot_reverse', 'qqbot'] as const

const BOT_TYPE_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  feishu: '飞书',
  dingtalk: '钉钉',
  wework: '企业微信(HTTP)',
  wework_ws: '企业微信(WS)',
  onebot: 'OneBot (正向WS)',
  onebot_reverse: 'OneBot (反向WS)',
  qqbot: 'QQ 官方机器人',
}

const CREDENTIAL_FIELDS: Record<string, { key: string; label: string; secret?: boolean; hint?: string }[]> = {
  telegram: [
    { key: 'bot_token', label: 'Bot Token', secret: true },
    {
      key: 'chat_id',
      label: '推送 Chat ID',
      hint: '接收推送消息的 Chat ID。向 @userinfobot 发任意消息即可获取你的数字 ID。',
    },
    { key: 'webhook_url', label: 'Webhook URL' },
    { key: 'proxy', label: 'Proxy (http/socks5)' },
  ],
  feishu: [
    { key: 'app_id', label: 'App ID' },
    { key: 'app_secret', label: 'App Secret', secret: true },
  ],
  dingtalk: [
    { key: 'client_id', label: 'Client ID / App Key' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
  ],
  wework: [
    { key: 'corp_id', label: 'Corp ID' },
    { key: 'token', label: 'Token', secret: true },
    { key: 'encoding_aes_key', label: 'Encoding AES Key', secret: true },
    { key: 'callback_port', label: 'Callback Port' },
    { key: 'callback_host', label: 'Callback Host' },
  ],
  wework_ws: [
    { key: 'bot_id', label: 'Bot ID' },
    { key: 'secret', label: 'Secret', secret: true },
  ],
  onebot: [
    { key: 'ws_url', label: 'WebSocket URL' },
    { key: 'access_token', label: 'Access Token', secret: true },
  ],
  onebot_reverse: [
    { key: 'reverse_host', label: 'Listen Host' },
    { key: 'reverse_port', label: 'Listen Port' },
    { key: 'access_token', label: 'Access Token', secret: true },
  ],
  qqbot: [
    { key: 'app_id', label: 'App ID' },
    { key: 'app_secret', label: 'App Secret', secret: true },
    { key: 'sandbox', label: 'Sandbox (true/false)' },
    { key: 'mode', label: 'Mode (websocket/webhook)' },
  ],
}

const EMPTY_BOT: IMBot = {
  id: '',
  type: 'telegram',
  name: '',
  agent_profile_id: 'default',
  enabled: true,
  credentials: {},
}

/** Map bot type to platform-specific settings component */
const PLATFORM_SETTINGS: Record<string, { component: LazyExoticComponent<ComponentType>; label: string }> = {
  onebot: { component: QQBotSettings, label: 'QQ Bot 高级设置（授权用户 / 授权群组）' },
  onebot_reverse: { component: QQBotSettings, label: 'QQ Bot 高级设置（授权用户 / 授权群组）' },
  qqbot: { component: QQOfficialSettings, label: 'QQ 官方机器人高级设置' },
}

// ─── Component ───────────────────────────────────────────────────────────

export default function BotManagementTab() {
  const { bots, loading, loaded, load, create, update, remove, toggle } = useBotStore(
    useShallow((state) => ({
      bots: state.bots,
      loading: state.loading,
      loaded: state.loaded,
      load: state.load,
      create: state.create,
      update: state.update,
      remove: state.remove,
      toggle: state.toggle,
    })),
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingBot, setEditingBot] = useState<IMBot>({ ...EMPTY_BOT })
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [testPushState, setTestPushState] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'error'>>({})
  const [testPushError, setTestPushError] = useState<Record<string, string>>({})
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [showPlatformSettings, setShowPlatformSettings] = useState(false)

  useEffect(() => {
    if (loaded) return
    const frame = window.requestAnimationFrame(() => {
      void load()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [load, loaded])

  const openCreate = () => {
    setEditingBot({ ...EMPTY_BOT })
    setIsCreating(true)
    setEditorOpen(true)
    setRevealedSecrets(new Set())
    setShowPlatformSettings(false)
  }

  const openEdit = (bot: IMBot) => {
    setEditingBot({ ...bot, credentials: { ...bot.credentials } })
    setIsCreating(false)
    setEditorOpen(true)
    setRevealedSecrets(new Set())
    setShowPlatformSettings(false)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setShowPlatformSettings(false)
  }

  const handleSave = async () => {
    if (!editingBot.id.trim()) return
    setSaving(true)
    try {
      if (isCreating) {
        await create(editingBot)
      } else {
        await update(editingBot.id, editingBot)
      }
      closeEditor()
    } catch (e) {
      console.error('Failed to save bot:', e)
    }
    setSaving(false)
  }

  const handleDelete = async (botId: string) => {
    try {
      await remove(botId)
      setConfirmDeleteId(null)
    } catch (e) {
      console.error('Failed to delete bot:', e)
    }
  }

  const handleToggle = async (bot: IMBot) => {
    try {
      await toggle(bot.id, !bot.enabled)
    } catch (e) {
      console.error('Failed to toggle bot:', e)
    }
  }

  const handleTestPush = async (bot: IMBot) => {
    setTestPushState((s) => ({ ...s, [bot.id]: 'sending' }))
    setTestPushError((s) => ({ ...s, [bot.id]: '' }))
    try {
      const result = await BotService.TestPush(bot.id)
      setTestPushState((s) => ({ ...s, [bot.id]: result.ok ? 'ok' : 'error' }))
      if (!result.ok) setTestPushError((s) => ({ ...s, [bot.id]: result.error ?? '未知错误' }))
    } catch {
      setTestPushState((s) => ({ ...s, [bot.id]: 'error' }))
      setTestPushError((s) => ({ ...s, [bot.id]: '推送请求失败' }))
    }
    setTimeout(() => setTestPushState((s) => ({ ...s, [bot.id]: 'idle' })), 4000)
  }

  const updateCredential = (key: string, value: string) => {
    setEditingBot((prev) => ({
      ...prev,
      credentials: { ...prev.credentials, [key]: value },
    }))
  }

  const credFields = useMemo(() => CREDENTIAL_FIELDS[editingBot.type] || [], [editingBot.type])

  const platformInfo = PLATFORM_SETTINGS[editingBot.type] || null
  const PlatformComponent = platformInfo?.component || null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">Bot 管理</h4>
          <p className="mt-1 text-xs text-gray-500">
            统一管理所有 IM 机器人，支持 Telegram、飞书、钉钉、企业微信、OneBot、QQ 官方等平台。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
          >
            <Plus size={14} />
            添加 Bot
          </button>
        </div>
      </div>

      {/* Bot Grid */}
      <div>
        <div className="grid gap-3 sm:grid-cols-2">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className={`rounded-xl border border-dark-border bg-dark-bg/70 p-4 transition ${bot.enabled ? 'opacity-100' : 'opacity-55'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bot size={15} className="text-blue-400" />
                    <h5 className="text-sm font-medium text-white">{bot.name || bot.id}</h5>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                      {BOT_TYPE_LABELS[bot.type] || bot.type}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-gray-500">{bot.id}</p>
                </div>
                <button
                  onClick={() => void handleToggle(bot)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    bot.enabled
                      ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      : 'bg-gray-500/15 text-gray-300 hover:bg-gray-500/25'
                  }`}
                >
                  {bot.enabled ? '已启用' : '已禁用'}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => openEdit(bot)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dark-border px-2.5 py-1 text-[11px] text-gray-300 transition hover:border-blue-500 hover:text-white"
                >
                  <Edit3 size={11} />
                  编辑
                </button>
                <button
                  onClick={() => void handleTestPush(bot)}
                  disabled={testPushState[bot.id] === 'sending'}
                  title={testPushState[bot.id] === 'error' ? testPushError[bot.id] : undefined}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition disabled:cursor-wait disabled:opacity-60 ${
                    testPushState[bot.id] === 'ok'
                      ? 'border-emerald-500 text-emerald-300'
                      : testPushState[bot.id] === 'error'
                        ? 'border-red-500 text-red-300'
                        : 'border-dark-border text-gray-300 hover:border-blue-500 hover:text-white'
                  }`}
                >
                  {testPushState[bot.id] === 'sending'
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Send size={11} />}
                  {testPushState[bot.id] === 'ok'
                    ? '已发送'
                    : testPushState[bot.id] === 'error'
                      ? '失败'
                      : '测试推送'}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(bot.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dark-border px-2.5 py-1 text-[11px] text-red-400 transition hover:border-red-500 hover:text-red-300"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {testPushState[bot.id] === 'error' && testPushError[bot.id] ? (
                <p className="mt-1.5 text-[10px] text-red-400">{testPushError[bot.id]}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!loading && bots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <Bot size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm text-gray-400">还没有配置任何 Bot</p>
          <p className="mt-1 text-xs text-gray-500">
            点击「添加 Bot」创建你的第一个 IM 机器人连接。
          </p>
        </div>
      ) : null}

      {/* Delete confirmation */}
      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-dark-border bg-slate-900 p-6 shadow-2xl">
            <p className="text-sm font-semibold text-white">确认删除此 Bot？</p>
            <p className="mt-2 text-xs text-gray-400">此操作不可撤销，删除后需要重新配置。</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-dark-border px-4 py-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Editor slide-in panel */}
      {editorOpen ? (
        <div className="fixed inset-0 z-[8000] flex justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="flex h-full w-[420px] flex-col border-l border-dark-border bg-slate-950 shadow-2xl animate-in slide-in-from-right">
            {/* Editor header */}
            <div className="flex items-center justify-between border-b border-dark-border px-5 py-4">
              <h3 className="text-sm font-semibold text-white">
                {isCreating ? '创建 Bot' : '编辑 Bot'}
              </h3>
              <button onClick={closeEditor} className="text-gray-400 transition hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Editor body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Bot ID */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-300">Bot ID</span>
                <input
                  value={editingBot.id}
                  onChange={(e) =>
                    setEditingBot((p) => ({
                      ...p,
                      id: e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase(),
                    }))
                  }
                  disabled={!isCreating}
                  placeholder="my-telegram-bot"
                  className="w-full rounded-lg border border-dark-border bg-slate-900 px-3 py-2 text-xs text-white placeholder-gray-600 disabled:opacity-50"
                />
                {isCreating ? (
                  <span className="mt-1 block text-[10px] text-gray-500">
                    仅允许小写字母、数字、下划线和连字符
                  </span>
                ) : null}
              </label>

              {/* Bot Name */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-300">名称</span>
                <input
                  value={editingBot.name}
                  onChange={(e) => setEditingBot((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Bot"
                  className="w-full rounded-lg border border-dark-border bg-slate-900 px-3 py-2 text-xs text-white placeholder-gray-600"
                />
              </label>

              {/* Bot Type */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-300">平台类型</span>
                <div className="relative">
                  <select
                    value={editingBot.type}
                    onChange={(e) => {
                      setEditingBot((p) => ({ ...p, type: e.target.value, credentials: {} }))
                      setShowPlatformSettings(false)
                    }}
                    disabled={!isCreating}
                    className="w-full appearance-none rounded-lg border border-dark-border bg-slate-900 px-3 py-2 pr-8 text-xs text-white disabled:opacity-50"
                  >
                    {BOT_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {BOT_TYPE_LABELS[bt] || bt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-gray-500" />
                </div>
              </label>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-300">启用</span>
                <button
                  type="button"
                  onClick={() => setEditingBot((p) => ({ ...p, enabled: !p.enabled }))}
                  className={`relative h-5 w-9 rounded-full transition ${
                    editingBot.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      editingBot.enabled ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Credentials */}
              <div>
                <span className="mb-2 block text-xs font-semibold text-gray-300">凭证配置</span>
                <div className="space-y-3">
                  {credFields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[11px] text-gray-500">{field.label}</span>
                      <div className="flex gap-1.5">
                        <input
                          type={field.secret && !revealedSecrets.has(field.key) ? 'password' : 'text'}
                          value={String(editingBot.credentials[field.key] ?? '')}
                          onChange={(e) => updateCredential(field.key, e.target.value)}
                          className="flex-1 rounded-lg border border-dark-border bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-gray-600"
                        />
                        {field.secret ? (
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedSecrets((prev) => {
                                const next = new Set(prev)
                                if (next.has(field.key)) next.delete(field.key)
                                else next.add(field.key)
                                return next
                              })
                            }
                            className="rounded-lg border border-dark-border px-2 text-gray-400 transition hover:text-white"
                          >
                            {revealedSecrets.has(field.key) ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        ) : null}
                      </div>
                      {field.hint ? (
                        <p className="mt-1 text-[10px] text-gray-500">{field.hint}</p>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>

              {/* Platform-specific settings */}
              {PlatformComponent ? (
                <div className="border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPlatformSettings((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-4 py-3 text-left transition hover:bg-white/5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-blue-300">平台高级设置</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {platformInfo.label}
                      </p>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-slate-400 transition ${showPlatformSettings ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showPlatformSettings ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/45 p-4">
                      <Suspense fallback={<PlatformSettingsFallback />}>
                        <PlatformComponent />
                      </Suspense>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Editor footer */}
            <div className="flex justify-end gap-2 border-t border-dark-border px-5 py-3">
              <button
                onClick={closeEditor}
                className="rounded-lg border border-dark-border px-4 py-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !editingBot.id.trim()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PlatformSettingsFallback() {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="h-9 animate-pulse rounded-lg bg-white/[0.05]" />
      <div className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />
      <div className="h-9 animate-pulse rounded-lg bg-white/[0.05]" />
    </div>
  )
}
