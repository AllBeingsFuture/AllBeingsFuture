/**
 * Telegram 远程控制设置面板（内嵌在 SettingsModal 中）
 * 4 个 Tab: Bot 配置 / AI 模型 / 授权用户 / 推送设置
 */

import { useEffect, useState } from 'react'
import { Plus, Trash2, TestTube, RefreshCw, Check, AlertCircle, Loader2, Pencil } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTelegramStore } from '../../stores/telegramStore'

type TabId = 'bot' | 'ai' | 'users' | 'push'

export default function TelegramSettings() {
  const [activeTab, setActiveTab] = useState<TabId>('bot')
  const { botStatus, fetchConfig, fetchStatus, fetchAIProviders, fetchAllowedUsers } = useTelegramStore(
    useShallow((state) => ({
      botStatus: state.botStatus,
      fetchConfig: state.fetchConfig,
      fetchStatus: state.fetchStatus,
      fetchAIProviders: state.fetchAIProviders,
      fetchAllowedUsers: state.fetchAllowedUsers,
    })),
  )

  useEffect(() => {
    void fetchConfig()
    void fetchStatus()
    void fetchAIProviders()
    void fetchAllowedUsers()
  }, [fetchAIProviders, fetchAllowedUsers, fetchConfig, fetchStatus])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'bot', label: 'Bot 配置' },
    { id: 'ai', label: 'AI 模型' },
    { id: 'users', label: '授权用户' },
    { id: 'push', label: '推送设置' },
  ]

  return (
    <div className="space-y-4">
      {/* Status + Tabs */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium text-text-primary">Telegram 远程控制</span>
        <StatusBadge status={botStatus} />
      </div>

      <div className="flex border-b border-white/10">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
              activeTab === tab.id
                ? 'text-blue-300 border-blue-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {activeTab === 'bot' && <BotTab />}
        {activeTab === 'ai' && <AITab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'push' && <PushTab />}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-green-500/20 text-green-300',
    starting: 'bg-yellow-500/20 text-yellow-300',
    stopped: 'bg-slate-500/20 text-slate-400',
    error: 'bg-red-500/20 text-red-300',
  }
  const labels: Record<string, string> = {
    running: '运行中',
    starting: '启动中',
    stopped: '已停止',
    error: '错误',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.stopped}`}>
      {labels[status] || status}
    </span>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-900 border border-white/10 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'

function BotTab() {
  const { config, updateConfig, botStatus, restartBot, fetchStatus } = useTelegramStore(
    useShallow((state) => ({
      config: state.config,
      updateConfig: state.updateConfig,
      botStatus: state.botStatus,
      restartBot: state.restartBot,
      fetchStatus: state.fetchStatus,
    })),
  )
  const [token, setToken] = useState('')
  const [restarting, setRestarting] = useState(false)
  const [proxyType, setProxyType] = useState('none')
  const [proxyHost, setProxyHost] = useState('')
  const [proxyPort, setProxyPort] = useState('')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')

  useEffect(() => {
    setToken(config.botToken || '')
    setProxyType(config.proxyType || 'none')
    setProxyHost(config.proxyHost || '')
    setProxyPort(config.proxyPort || '')
    setProxyUsername(config.proxyUsername || '')
    setProxyPassword(config.proxyPassword || '')
  }, [config.botToken, config.proxyType, config.proxyHost, config.proxyPort, config.proxyUsername, config.proxyPassword])

  const handleSaveToken = async () => { await updateConfig('botToken', token) }
  const handleSaveProxy = async () => {
    await updateConfig('proxyType', proxyType)
    await updateConfig('proxyHost', proxyHost)
    await updateConfig('proxyPort', proxyPort)
    await updateConfig('proxyUsername', proxyUsername)
    await updateConfig('proxyPassword', proxyPassword)
  }
  const handleToggleBot = async () => {
    await updateConfig('botEnabled', config.botEnabled !== 'true' ? 'true' : 'false')
  }
  const handleRestart = async () => {
    setRestarting(true)
    await restartBot()
    setTimeout(() => { void fetchStatus(); setRestarting(false) }, 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Bot Token</label>
        <div className="flex gap-2">
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            placeholder="输入 Telegram Bot Token" className={`flex-1 ${inputCls}`} />
          <button onClick={handleSaveToken}
            className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 shrink-0">保存</button>
        </div>
        <p className="text-xs text-slate-500 mt-1">通过 @BotFather 创建 Bot 获取 Token</p>
      </div>

      <div className="border border-white/10 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">代理设置</label>
          <span className="text-xs text-slate-500">国内需配置代理才能连接 Telegram</span>
        </div>
        <div className="flex gap-2">
          {(['none', 'http', 'socks5'] as const).map(t => (
            <button key={t} onClick={() => setProxyType(t)}
              className={`px-3 py-1.5 rounded text-xs transition ${
                proxyType === t ? 'bg-blue-500/15 text-blue-300 border border-blue-400/40' : 'bg-slate-800 text-slate-400 border border-white/10'
              }`}>
              {t === 'none' ? '不使用' : t.toUpperCase()}
            </button>
          ))}
        </div>
        {proxyType !== 'none' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><input value={proxyHost} onChange={e => setProxyHost(e.target.value)} placeholder="代理地址" className={inputCls} /></div>
              <input value={proxyPort} onChange={e => setProxyPort(e.target.value)} placeholder="端口" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={proxyUsername} onChange={e => setProxyUsername(e.target.value)} placeholder="用户名 (可选)" className={inputCls} />
              <input type="password" value={proxyPassword} onChange={e => setProxyPassword(e.target.value)} placeholder="密码 (可选)" className={inputCls} />
            </div>
            <button onClick={handleSaveProxy} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500">保存代理</button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">启用 Bot</span>
        <button onClick={handleToggleBot}
          className={`w-10 h-5 rounded-full relative transition ${config.botEnabled === 'true' ? 'bg-green-500' : 'bg-slate-600'}`}>
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition ${config.botEnabled === 'true' ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleRestart} disabled={restarting}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-slate-300 rounded text-sm hover:bg-slate-700 disabled:opacity-50">
          {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {restarting ? '重启中...' : '重启 Bot'}
        </button>
        <StatusBadge status={botStatus} />
      </div>
    </div>
  )
}

function AITab() {
  const { aiProviders, addAIProvider, updateAIProvider, deleteAIProvider, testAIProvider } = useTelegramStore(
    useShallow((state) => ({
      aiProviders: state.aiProviders,
      addAIProvider: state.addAIProvider,
      updateAIProvider: state.updateAIProvider,
      deleteAIProvider: state.deleteAIProvider,
      testAIProvider: state.testAIProvider,
    })),
  )
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', apiEndpoint: '', apiKey: '', model: '', maxTokens: 4096, priority: 0 })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string } | null>(null)

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ name: '', apiEndpoint: '', apiKey: '', model: '', maxTokens: 4096, priority: 0 }) }

  const handleSubmit = async () => {
    if (!form.name || !form.apiEndpoint || !form.model) return
    if (editingId) {
      const updates: any = { name: form.name, apiEndpoint: form.apiEndpoint, model: form.model, maxTokens: form.maxTokens, priority: form.priority }
      if (form.apiKey) updates.apiKey = form.apiKey
      const result = await updateAIProvider(editingId, updates)
      if (result.success) resetForm()
    } else {
      if (!form.apiKey) return
      const result = await addAIProvider({ ...form, id: `tg-ai-${Date.now()}` })
      if (result.success) resetForm()
    }
  }

  const handleEdit = (p: any) => {
    setEditingId(p.id)
    setForm({ name: p.name, apiEndpoint: p.apiEndpoint || p.api_endpoint, apiKey: '', model: p.model, maxTokens: p.maxTokens || p.max_tokens || 4096, priority: p.priority || 0 })
    setShowForm(true)
  }

  const handleTest = async (provider: any) => {
    setTesting(provider.id); setTestResult(null)
    const result = await testAIProvider({ providerId: provider.id, apiEndpoint: provider.apiEndpoint || provider.api_endpoint, model: provider.model })
    setTestResult({ id: provider.id, ...result }); setTesting(null)
  }

  return (
    <div className="space-y-3">
      {aiProviders.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-white/10">
          <div>
            <div className="text-sm font-medium text-white">{p.name}</div>
            <div className="text-xs text-slate-400">{p.model} · {p.apiEndpoint || p.api_endpoint}</div>
          </div>
          <div className="flex items-center gap-2">
            {testResult && testResult.id === p.id && (testResult.success ? <Check className="w-4 h-4 text-green-400" /> : <span title={testResult.error || ''}><AlertCircle className="w-4 h-4 text-red-400" /></span>)}
            <button onClick={() => handleTest(p)} disabled={testing === p.id} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="测试连接">
              {testing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => handleEdit(p)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="编辑"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => deleteAIProvider(p.id)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      {showForm ? (
        <div className="p-3 bg-slate-800/50 rounded border border-blue-400/30 space-y-2">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="名称" className={inputCls} />
          <input value={form.apiEndpoint} onChange={e => setForm({...form, apiEndpoint: e.target.value})} placeholder="API 端点" className={inputCls} />
          <input value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})} type="password" placeholder={editingId ? "留空则不修改" : "API Key"} className={inputCls} />
          <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="模型名" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500">{editingId ? '保存' : '添加'}</button>
            <button onClick={resetForm} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs">取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-300 hover:bg-slate-800 rounded">
          <Plus className="w-4 h-4" /> 添加 AI 提供者
        </button>
      )}
    </div>
  )
}

function UsersTab() {
  const { allowedUsers, addAllowedUser, removeAllowedUser } = useTelegramStore(
    useShallow((state) => ({
      allowedUsers: state.allowedUsers,
      addAllowedUser: state.addAllowedUser,
      removeAllowedUser: state.removeAllowedUser,
    })),
  )
  const [showAdd, setShowAdd] = useState(false)
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('admin')

  const handleAdd = async () => {
    const id = parseInt(userId)
    if (isNaN(id)) return
    const result = await addAllowedUser(id, username || undefined, undefined, role)
    if (result.success) { setShowAdd(false); setUserId(''); setUsername('') }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">只有授权的 Telegram 用户才能与 Bot 交互。</p>
      {allowedUsers.map((u: any) => (
        <div key={u.userId} className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-white/10">
          <div>
            <div className="text-sm font-medium text-white">{u.username ? `@${u.username}` : `User ${u.userId}`}</div>
            <div className="text-xs text-slate-400">ID: {u.userId} · {u.role === 'admin' ? '管理员' : '只读'}</div>
          </div>
          <button onClick={() => removeAllowedUser(u.userId)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {showAdd ? (
        <div className="p-3 bg-slate-800/50 rounded border border-blue-400/30 space-y-2">
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Telegram User ID (数字)" className={inputCls} />
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="用户名 (可选)" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setRole('admin')} className={`px-3 py-1 rounded text-xs ${role === 'admin' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/40' : 'bg-slate-800 text-slate-400 border border-white/10'}`}>管理员</button>
            <button onClick={() => setRole('viewer')} className={`px-3 py-1 rounded text-xs ${role === 'viewer' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/40' : 'bg-slate-800 text-slate-400 border border-white/10'}`}>只读</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500">添加</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded text-xs">取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-300 hover:bg-slate-800 rounded">
          <Plus className="w-4 h-4" /> 添加授权用户
        </button>
      )}
    </div>
  )
}

function PushTab() {
  const { config, updateConfig } = useTelegramStore(useShallow((state) => ({
    config: state.config,
    updateConfig: state.updateConfig,
  })))
  const toggles = [
    { key: 'pushEnabled', label: '启用事件推送', desc: '总开关，关闭后不推送任何事件' },
    { key: 'pushConfirmation', label: '确认请求通知', desc: 'CLI 需要确认操作时推送' },
    { key: 'pushErrors', label: '错误通知', desc: 'CLI 出现错误时推送' },
    { key: 'pushCompletions', label: '完成通知', desc: '会话完成时推送' },
    { key: 'pushStuck', label: '卡住通知', desc: '会话可能卡住时推送' },
    { key: 'pushWorkflow', label: '工作流通知', desc: '工作流完成/失败/需审核时推送' },
  ]
  return (
    <div className="space-y-3">
      {toggles.map(t => (
        <div key={t.key} className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm text-white">{t.label}</div>
            <div className="text-xs text-slate-500">{t.desc}</div>
          </div>
          <button onClick={() => updateConfig(t.key, config[t.key] === 'false' ? 'true' : 'false')}
            className={`w-10 h-5 rounded-full relative transition ${config[t.key] !== 'false' ? 'bg-green-500' : 'bg-slate-600'}`}>
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition ${config[t.key] !== 'false' ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}
