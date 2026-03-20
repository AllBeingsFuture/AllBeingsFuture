/**
 * QQ Bot 设置面板（内嵌在 SettingsModal 中）
 * 3 个 Tab: Bot 配置 / 授权用户 / 授权群组
 */

import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { useQQBotStore } from '../../stores/qqbotStore'

type TabId = 'bot' | 'users' | 'groups'

export default function QQBotSettings() {
  const [activeTab, setActiveTab] = useState<TabId>('bot')
  const store = useQQBotStore()

  useEffect(() => {
    store.fetchConfig()
    store.fetchStatus()
    store.fetchAllowedUsers()
    store.fetchAllowedGroups()
  }, [])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'bot', label: 'Bot 配置' },
    { id: 'users', label: '授权用户' },
    { id: 'groups', label: '授权群组' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium text-text-primary">QQ Bot 远程控制</span>
        <StatusBadge status={store.botStatus} />
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
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'groups' && <GroupsTab />}
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
  const { config, updateConfig, botStatus, restartBot, fetchStatus } = useQQBotStore()
  const [httpEndpoint, setHttpEndpoint] = useState('')
  const [wsEndpoint, setWsEndpoint] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [commandPrefix, setCommandPrefix] = useState('')
  const [mode, setMode] = useState('private')
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    setHttpEndpoint(config.httpEndpoint || '')
    setWsEndpoint(config.wsEndpoint || '')
    setAccessToken(config.accessToken || '')
    setCommandPrefix(config.commandPrefix || '/')
    setMode(config.mode || 'private')
  }, [config.httpEndpoint, config.wsEndpoint, config.accessToken, config.commandPrefix, config.mode])

  const handleSaveEndpoints = async () => {
    await updateConfig('httpEndpoint', httpEndpoint)
    await updateConfig('wsEndpoint', wsEndpoint)
    await updateConfig('accessToken', accessToken)
    await updateConfig('commandPrefix', commandPrefix)
    await updateConfig('mode', mode)
  }

  const handleToggleBot = async () => {
    await updateConfig('enabled', config.enabled === 'true' ? 'false' : 'true')
  }

  const handleRestart = async () => {
    setRestarting(true)
    await restartBot()
    setTimeout(() => { fetchStatus(); setRestarting(false) }, 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">NapCatQQ HTTP 端点</label>
        <input value={httpEndpoint} onChange={e => setHttpEndpoint(e.target.value)}
          placeholder="http://127.0.0.1:3000" className={inputCls} />
        <p className="text-xs text-slate-500 mt-1">NapCatQQ 的 OneBot HTTP API 地址</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">NapCatQQ WebSocket 端点</label>
        <input value={wsEndpoint} onChange={e => setWsEndpoint(e.target.value)}
          placeholder="ws://127.0.0.1:3001" className={inputCls} />
        <p className="text-xs text-slate-500 mt-1">用于接收消息的 WebSocket 正向连接地址</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Access Token</label>
        <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
          placeholder="留空则不验证" className={inputCls} />
        <p className="text-xs text-slate-500 mt-1">与 NapCatQQ 配置的 access_token 保持一致</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">命令前缀</label>
        <input value={commandPrefix} onChange={e => setCommandPrefix(e.target.value)}
          placeholder="/" className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">消息模式</label>
        <div className="flex gap-2">
          {(['private', 'group', 'both'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded text-xs transition ${
                mode === m ? 'bg-blue-500/15 text-blue-300 border border-blue-400/40' : 'bg-slate-800 text-slate-400 border border-white/10'
              }`}>
              {m === 'private' ? '仅私聊' : m === 'group' ? '仅群聊' : '私聊+群聊'}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSaveEndpoints}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500">
        保存配置
      </button>

      <div className="border-t border-white/10 pt-4 flex items-center justify-between">
        <span className="text-sm text-slate-300">启用 Bot</span>
        <button onClick={handleToggleBot}
          className={`w-10 h-5 rounded-full relative transition ${config.enabled === 'true' ? 'bg-green-500' : 'bg-slate-600'}`}>
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition ${config.enabled === 'true' ? 'left-5' : 'left-0.5'}`} />
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

function UsersTab() {
  const { allowedUsers, addAllowedUser, removeAllowedUser } = useQQBotStore()
  const [showAdd, setShowAdd] = useState(false)
  const [userId, setUserId] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('admin')

  const handleAdd = async () => {
    const id = parseInt(userId)
    if (isNaN(id)) return
    const result = await addAllowedUser(id, nickname || undefined, role)
    if (result.success) { setShowAdd(false); setUserId(''); setNickname('') }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">只有授权的 QQ 用户才能与 Bot 交互。</p>
      {allowedUsers.map((u: any) => (
        <div key={u.userId} className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-white/10">
          <div>
            <div className="text-sm font-medium text-white">{u.nickname || `用户 ${u.userId}`}</div>
            <div className="text-xs text-slate-400">QQ: {u.userId} · {u.role === 'admin' ? '管理员' : '只读'}</div>
          </div>
          <button onClick={() => removeAllowedUser(u.userId)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {showAdd ? (
        <div className="p-3 bg-slate-800/50 rounded border border-blue-400/30 space-y-2">
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="QQ 号 (数字)" className={inputCls} />
          <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="昵称 (可选)" className={inputCls} />
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

function GroupsTab() {
  const { allowedGroups, addAllowedGroup, removeAllowedGroup } = useQQBotStore()
  const [showAdd, setShowAdd] = useState(false)
  const [groupId, setGroupId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('admin')

  const handleAdd = async () => {
    const id = parseInt(groupId)
    if (isNaN(id)) return
    const result = await addAllowedGroup(id, groupName || undefined, role)
    if (result.success) { setShowAdd(false); setGroupId(''); setGroupName('') }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">只有授权的 QQ 群才能与 Bot 交互。</p>
      {allowedGroups.map((g: any) => (
        <div key={g.groupId} className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-white/10">
          <div>
            <div className="text-sm font-medium text-white">{g.groupName || `群 ${g.groupId}`}</div>
            <div className="text-xs text-slate-400">群号: {g.groupId} · {g.role === 'admin' ? '管理员' : '只读'}</div>
          </div>
          <button onClick={() => removeAllowedGroup(g.groupId)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {showAdd ? (
        <div className="p-3 bg-slate-800/50 rounded border border-blue-400/30 space-y-2">
          <input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="QQ 群号 (数字)" className={inputCls} />
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="群名称 (可选)" className={inputCls} />
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
          <Plus className="w-4 h-4" /> 添加授权群组
        </button>
      )}
    </div>
  )
}
