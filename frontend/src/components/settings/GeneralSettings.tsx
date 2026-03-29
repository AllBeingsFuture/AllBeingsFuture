import { useEffect, useState } from 'react'
import { Globe, GitBranch, MessageSquare, Monitor, Bell, RefreshCw, Save, Info } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore } from '../../stores/settingsStore'

export default function GeneralSettings() {
  const { settings, setProxy, setAutoWorktree, setAutoLaunch, setNotification, setLanguage } =
    useSettingsStore(useShallow((state) => ({
      settings: state.settings,
      setProxy: state.setProxy,
      setAutoWorktree: state.setAutoWorktree,
      setAutoLaunch: state.setAutoLaunch,
      setNotification: state.setNotification,
      setLanguage: state.setLanguage,
    })))

  // Local proxy state (only saved on button click)
  const [proxyType, setProxyType] = useState(settings.proxyType || 'none')
  const [proxyHost, setProxyHost] = useState(settings.proxyHost || '')
  const [proxyPort, setProxyPort] = useState(settings.proxyPort || '')
  const [proxyUsername, setProxyUsername] = useState(settings.proxyUsername || '')
  const [proxyPassword, setProxyPassword] = useState(settings.proxyPassword || '')
  const [proxySaved, setProxySaved] = useState(false)

  useEffect(() => {
    setProxyType(settings.proxyType || 'none')
    setProxyHost(settings.proxyHost || '')
    setProxyPort(settings.proxyPort || '')
    setProxyUsername(settings.proxyUsername || '')
    setProxyPassword(settings.proxyPassword || '')
  }, [settings.proxyHost, settings.proxyPassword, settings.proxyPort, settings.proxyType, settings.proxyUsername])

  const handleSaveProxy = async () => {
    await setProxy(proxyType as any, proxyHost, proxyPort, proxyUsername, proxyPassword)
    setProxySaved(true)
    setTimeout(() => setProxySaved(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* ---- 代理设置 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Globe size={16} className="text-gray-400" />
          代理设置
          <span className="text-xs text-gray-500">用于 AI 连接 Anthropic / Telegram 等服务</span>
        </h4>

        {/* Proxy type buttons */}
        <div className="flex gap-2 mb-3">
          {(['none', 'http', 'socks5'] as const).map(type => (
            <button
              key={type}
              onClick={() => setProxyType(type)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                proxyType === type
                  ? 'border-dark-accent bg-dark-accent/10 text-white'
                  : 'border-dark-border text-gray-400 hover:text-white'
              }`}
            >
              {type === 'none' ? '不使用' : type.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveProxy}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          <Save size={12} />
          {proxySaved ? '已保存' : '保存代理设置'}
        </button>

        {/* Proxy fields */}
        {proxyType !== 'none' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">地址</label>
              <input
                value={proxyHost}
                onChange={e => setProxyHost(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full px-2.5 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-xs outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">端口</label>
              <input
                value={proxyPort}
                onChange={e => setProxyPort(e.target.value)}
                placeholder="7890"
                className="w-full px-2.5 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-xs outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">用户名（可选）</label>
              <input
                value={proxyUsername}
                onChange={e => setProxyUsername(e.target.value)}
                placeholder=""
                className="w-full px-2.5 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-xs outline-none focus:border-dark-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">密码（可选）</label>
              <input
                type="password"
                value={proxyPassword}
                onChange={e => setProxyPassword(e.target.value)}
                placeholder=""
                className="w-full px-2.5 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-xs outline-none focus:border-dark-accent"
              />
            </div>
          </div>
        )}

        {/* Proxy info box */}
        <div className="px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg">
          <p className="text-xs text-gray-400 flex items-start gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-yellow-500" />
            {proxyType === 'none'
              ? '未配置代理。程序将自动从系统环境变量或 PowerShell profile 读取代理（仅 Windows），AI 连接和 Telegram Bot 均适用。如果连接失败，请在此手动配置代理。'
              : `已配置 ${proxyType.toUpperCase()} 代理：${proxyHost}:${proxyPort}`}
          </p>
        </div>
      </section>

      {/* ---- Git Worktree 隔离 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <GitBranch size={16} className="text-gray-400" />
          Git Worktree 隔离
        </h4>

        <Toggle
          enabled={settings.autoWorktree}
          onChange={setAutoWorktree}
          label="Git 仓库中改代码前必须先进入 worktree"
          description="开启后，新会话仍在你选择的目录启动；但只要后续涉及代码修改，注入到 Codex/Claude 的规则都会要求 Agent 先进入独立 worktree，再进行写入、提交和合并。"
        />
      </section>

      {/* ---- 回复语言 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <MessageSquare size={16} className="text-gray-400" />
          回复语言
        </h4>

        <Toggle
          enabled={settings.alwaysReplyInChinese}
          onChange={setLanguage}
          label="默认用中文回复用户"
          description="开启后，会在新建会话、恢复会话、子 Agent、任务会话和工作流会话中注入「面向用户回复时默认使用中文」的偏好。不会翻译代码、命令、路径、日志、报错、配置键名或其他内置系统规则。"
        />
      </section>

      {/* ---- 开机自启 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Monitor size={16} className="text-gray-400" />
          开机自启
        </h4>

        <Toggle
          enabled={settings.autoLaunch}
          onChange={setAutoLaunch}
          label="系统登录后自动启动 AllBeingsFuture"
          description="开启后，电脑重启或用户登录时将自动启动应用。Telegram 远程控制随时可用。"
        />
      </section>

      {/* ---- 系统通知 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Bell size={16} className="text-gray-400" />
          系统通知
        </h4>

        <Toggle
          enabled={settings.notificationEnabled}
          onChange={setNotification}
          label="会话完成时发送系统通知"
          description="主会话任务完成后弹出操作系统原生通知。子 Agent 会话不会触发通知。"
        />
      </section>

      {/* ---- 应用更新 ---- */}
      <section>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <RefreshCw size={16} className="text-gray-400" />
          应用更新
        </h4>

        <div className="flex items-center justify-between px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg">
          <div>
            <p className="text-sm">当前版本：<span className="text-gray-400">v1.0.0</span></p>
            <p className="text-xs text-gray-500 mt-0.5">已是最新版本</p>
          </div>
          <button className="px-3 py-1.5 text-xs border border-dark-border text-gray-400 hover:text-white hover:border-dark-accent rounded-lg transition-colors">
            检查更新
          </button>
        </div>
      </section>
    </div>
  )
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean
  onChange: (val: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div
        className={`w-9 h-5 rounded-full transition-colors relative shrink-0 mt-0.5 ${enabled ? 'bg-dark-accent' : 'bg-gray-600'}`}
        onClick={() => onChange(!enabled)}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <div>
        <span className="text-sm">{label}</span>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </label>
  )
}
