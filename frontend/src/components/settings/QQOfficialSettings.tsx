/**
 * QQ 官方机器人设置面板（内嵌在 SettingsModal 中）
 * QQ 开放平台 Bot API 配置
 */

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { useQQOfficialStore } from '../../stores/qqofficialStore'

export default function QQOfficialSettings() {
  const store = useQQOfficialStore()

  useEffect(() => {
    store.fetchConfig()
    store.fetchStatus()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium text-text-primary">QQ 官方机器人</span>
        <StatusBadge status={store.botStatus} />
      </div>
      <p className="text-xs text-slate-500">
        通过 QQ 开放平台官方 Bot API 接入，需要先在{' '}
        <a href="https://q.qq.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          QQ 开放平台
        </a>{' '}
        创建机器人并获取 AppID 和 AppSecret。
      </p>
      <BotConfigTab />
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

function BotConfigTab() {
  const { config, updateConfig, botStatus, restartBot, fetchStatus } = useQQOfficialStore()
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [commandPrefix, setCommandPrefix] = useState('')
  const [sandbox, setSandbox] = useState(true)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    setAppId(config.appId || '')
    setAppSecret(config.appSecret || '')
    setCommandPrefix(config.commandPrefix || '/')
    setSandbox(config.sandbox === 'true' || config.sandbox === true as unknown as string)
  }, [config.appId, config.appSecret, config.commandPrefix, config.sandbox])

  const handleSave = async () => {
    await updateConfig('appId', appId)
    await updateConfig('appSecret', appSecret)
    await updateConfig('commandPrefix', commandPrefix)
    await updateConfig('sandbox', sandbox ? 'true' : 'false')
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
        <label className="block text-sm font-medium text-slate-300 mb-1">AppID</label>
        <input value={appId} onChange={e => setAppId(e.target.value)}
          placeholder="QQ 开放平台 AppID" className={inputCls} />
        <p className="text-xs text-slate-500 mt-1">在 QQ 开放平台机器人管理页面获取</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">AppSecret</label>
        <input type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)}
          placeholder="QQ 开放平台 AppSecret" className={inputCls} />
        <p className="text-xs text-slate-500 mt-1">注意：AppSecret 仅首次查看时显示明文，请妥善保存</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">命令前缀</label>
        <input value={commandPrefix} onChange={e => setCommandPrefix(e.target.value)}
          placeholder="/" className={inputCls} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">沙箱环境</span>
        <button onClick={() => setSandbox(!sandbox)}
          className={`w-10 h-5 rounded-full relative transition ${sandbox ? 'bg-yellow-500' : 'bg-slate-600'}`}>
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition ${sandbox ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-xs text-slate-500 -mt-2">开发调试时建议开启沙箱，正式上线后关闭</p>

      <button onClick={handleSave}
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
