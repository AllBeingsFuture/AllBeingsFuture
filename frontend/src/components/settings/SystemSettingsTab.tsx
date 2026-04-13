import { useState, useEffect, useCallback } from 'react'
import { Save, RefreshCw, CheckCircle2, AlertTriangle, Database, Activity, Shield, Cpu, Network, FileText } from 'lucide-react'
import { SystemSettingsService } from '../../../bindings/allbeingsfuture/internal/services'

interface SystemConfig {
  auth: { accessTokenTTL: number; refreshTokenTTL: number; allowAnonymous: boolean }
  log: { level: string; filePath: string; maxSizeMB: number; maxBackups: number; maxAgeDays: number; console: boolean }
  telemetry: { enabled: boolean; endpoint: string; batchSize: number; flushInterval: number; sampleRate: number }
  queue: { maxConcurrency: number; maxRetries: number; retryBackoff: number; persistEnabled: boolean }
  workflow: { autoApprove: boolean; stepTimeout: number }
  bridge: { host: string; port: number; timeout: number }
  notification: { enabled: boolean; sound: string }
  update: { channel: string; autoCheck: boolean; autoDownload: boolean }
}

const DEFAULT_CONFIG: SystemConfig = {
  auth: { accessTokenTTL: 3600, refreshTokenTTL: 2592000, allowAnonymous: true },
  log: { level: 'info', filePath: '', maxSizeMB: 20, maxBackups: 7, maxAgeDays: 7, console: true },
  telemetry: { enabled: false, endpoint: '', batchSize: 20, flushInterval: 30, sampleRate: 1.0 },
  queue: { maxConcurrency: 4, maxRetries: 3, retryBackoff: 5, persistEnabled: true },
  workflow: { autoApprove: false, stepTimeout: 600 },
  bridge: { host: '127.0.0.1', port: 0, timeout: 60 },
  notification: { enabled: true, sound: 'default' },
  update: { channel: 'stable', autoCheck: true, autoDownload: false },
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        {icon}
        {title}
      </h4>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  )
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="min-w-0">
        <p className="text-xs text-gray-300">{label}</p>
        {description && <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">
        {children}
      </div>
    </div>
  )
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${enabled ? 'bg-blue-500' : 'bg-gray-600'}`}
      onClick={() => onChange(!enabled)}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  )
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
      className="w-20 px-2 py-1 bg-gray-800 border border-white/10 rounded-lg text-xs text-right outline-none focus:border-blue-400/40"
    />
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-48 px-2 py-1 bg-gray-800 border border-white/10 rounded-lg text-xs outline-none focus:border-blue-400/40"
    />
  )
}

export default function SystemSettingsTab() {
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [valid, setValid] = useState<boolean | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await SystemSettingsService.GetConfig()
      if (raw) {
        setConfig({
          auth: { ...DEFAULT_CONFIG.auth, ...raw.auth },
          log: { ...DEFAULT_CONFIG.log, ...raw.log },
          telemetry: { ...DEFAULT_CONFIG.telemetry, ...raw.telemetry },
          queue: { ...DEFAULT_CONFIG.queue, ...raw.queue },
          workflow: { ...DEFAULT_CONFIG.workflow, ...raw.workflow },
          bridge: { ...DEFAULT_CONFIG.bridge, ...raw.bridge },
          notification: { ...DEFAULT_CONFIG.notification, ...raw.notification },
          update: { ...DEFAULT_CONFIG.update, ...raw.update },
        })
      }
    } catch (e: any) {
      setError(e?.message || '加载系统配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const batch: Record<string, string> = {
        'log.level': config.log.level,
        'log.maxSizeMB': String(config.log.maxSizeMB),
        'log.maxBackups': String(config.log.maxBackups),
        'log.maxAgeDays': String(config.log.maxAgeDays),
        'log.console': String(config.log.console),
        'telemetry.enabled': String(config.telemetry.enabled),
        'telemetry.batchSize': String(config.telemetry.batchSize),
        'telemetry.flushInterval': String(config.telemetry.flushInterval),
        'telemetry.sampleRate': String(config.telemetry.sampleRate),
        'queue.maxConcurrency': String(config.queue.maxConcurrency),
        'queue.maxRetries': String(config.queue.maxRetries),
        'queue.retryBackoff': String(config.queue.retryBackoff),
        'queue.persistEnabled': String(config.queue.persistEnabled),
        'workflow.autoApprove': String(config.workflow.autoApprove),
        'workflow.stepTimeout': String(config.workflow.stepTimeout),
        'bridge.host': config.bridge.host,
        'bridge.port': String(config.bridge.port),
        'bridge.timeout': String(config.bridge.timeout),
        'notification.enabled': String(config.notification.enabled),
        'notification.sound': config.notification.sound,
        'update.channel': config.update.channel,
        'update.autoCheck': String(config.update.autoCheck),
        'update.autoDownload': String(config.update.autoDownload),
      }
      await SystemSettingsService.UpdateBatch(batch)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e?.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleValidate = async () => {
    setValidating(true)
    try {
      await SystemSettingsService.ValidateConfig()
      setValid(true)
      setTimeout(() => setValid(null), 3000)
    } catch {
      setValid(false)
      setTimeout(() => setValid(null), 3000)
    } finally {
      setValidating(false)
    }
  }

  const update = <K extends keyof SystemConfig>(section: K, key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }))
  }

  return (
    <div className="space-y-8">
      {/* 操作栏 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-40"
        >
          {saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
          {saved ? '已保存' : '保存配置'}
        </button>
        <button
          onClick={handleValidate}
          disabled={validating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <Shield size={12} />
          校验配置
        </button>
        <button
          onClick={loadConfig}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
        {valid === true && <span className="text-xs text-green-400">✓ 配置有效</span>}
        {valid === false && <span className="text-xs text-red-400">✗ 配置存在问题</span>}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {/* 日志配置 */}
      <Section icon={<FileText size={16} className="text-gray-400" />} title="日志">
        <Field label="日志级别" description="debug / info / warn / error">
          <select
            value={config.log.level}
            onChange={e => update('log', 'level', e.target.value)}
            className="px-2 py-1 bg-gray-800 border border-white/10 rounded-lg text-xs outline-none focus:border-blue-400/40"
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </Field>
        <Field label="单文件大小上限" description="MB">
          <NumberInput value={config.log.maxSizeMB} onChange={v => update('log', 'maxSizeMB', v)} min={1} max={500} />
        </Field>
        <Field label="保留备份数">
          <NumberInput value={config.log.maxBackups} onChange={v => update('log', 'maxBackups', v)} min={1} max={100} />
        </Field>
        <Field label="保留天数">
          <NumberInput value={config.log.maxAgeDays} onChange={v => update('log', 'maxAgeDays', v)} min={1} max={365} />
        </Field>
        <Field label="控制台输出">
          <Toggle enabled={config.log.console} onChange={v => update('log', 'console', v)} />
        </Field>
      </Section>

      {/* 队列配置 */}
      <Section icon={<Database size={16} className="text-gray-400" />} title="任务队列">
        <Field label="最大并发数" description="同时执行的任务数量">
          <NumberInput value={config.queue.maxConcurrency} onChange={v => update('queue', 'maxConcurrency', v)} min={1} max={32} />
        </Field>
        <Field label="最大重试次数">
          <NumberInput value={config.queue.maxRetries} onChange={v => update('queue', 'maxRetries', v)} min={0} max={20} />
        </Field>
        <Field label="重试退避（秒）" description="失败后等待时间">
          <NumberInput value={config.queue.retryBackoff} onChange={v => update('queue', 'retryBackoff', v)} min={1} max={300} />
        </Field>
        <Field label="持久化">
          <Toggle enabled={config.queue.persistEnabled} onChange={v => update('queue', 'persistEnabled', v)} />
        </Field>
      </Section>

      {/* 工作流配置 */}
      <Section icon={<Cpu size={16} className="text-gray-400" />} title="工作流">
        <Field label="自动批准" description="工作流步骤自动通过，无需人工确认">
          <Toggle enabled={config.workflow.autoApprove} onChange={v => update('workflow', 'autoApprove', v)} />
        </Field>
        <Field label="单步超时（秒）">
          <NumberInput value={config.workflow.stepTimeout} onChange={v => update('workflow', 'stepTimeout', v)} min={30} max={7200} />
        </Field>
      </Section>

      {/* Bridge 配置 */}
      <Section icon={<Network size={16} className="text-gray-400" />} title="Bridge 连接">
        <Field label="主机地址">
          <TextInput value={config.bridge.host} onChange={v => update('bridge', 'host', v)} placeholder="127.0.0.1" />
        </Field>
        <Field label="端口" description="0 表示自动分配">
          <NumberInput value={config.bridge.port} onChange={v => update('bridge', 'port', v)} min={0} max={65535} />
        </Field>
        <Field label="连接超时（秒）">
          <NumberInput value={config.bridge.timeout} onChange={v => update('bridge', 'timeout', v)} min={5} max={300} />
        </Field>
      </Section>

      {/* 遥测配置 */}
      <Section icon={<Activity size={16} className="text-gray-400" />} title="遥测">
        <Field label="启用遥测">
          <Toggle enabled={config.telemetry.enabled} onChange={v => update('telemetry', 'enabled', v)} />
        </Field>
        {config.telemetry.enabled && (
          <>
            <Field label="批处理大小">
              <NumberInput value={config.telemetry.batchSize} onChange={v => update('telemetry', 'batchSize', v)} min={1} max={200} />
            </Field>
            <Field label="刷新间隔（秒）">
              <NumberInput value={config.telemetry.flushInterval} onChange={v => update('telemetry', 'flushInterval', v)} min={5} max={300} />
            </Field>
            <Field label="采样率" description="0.0 ~ 1.0">
              <NumberInput value={config.telemetry.sampleRate} onChange={v => update('telemetry', 'sampleRate', v)} min={0} max={1} />
            </Field>
          </>
        )}
      </Section>

      {/* 通知配置 */}
      <Section icon={<Activity size={16} className="text-gray-400" />} title="通知">
        <Field label="启用通知">
          <Toggle enabled={config.notification.enabled} onChange={v => update('notification', 'enabled', v)} />
        </Field>
        <Field label="通知音效">
          <TextInput value={config.notification.sound} onChange={v => update('notification', 'sound', v)} placeholder="default" />
        </Field>
      </Section>

      {/* 更新配置 */}
      <Section icon={<RefreshCw size={16} className="text-gray-400" />} title="更新">
        <Field label="更新频道">
          <select
            value={config.update.channel}
            onChange={e => update('update', 'channel', e.target.value)}
            className="px-2 py-1 bg-gray-800 border border-white/10 rounded-lg text-xs outline-none focus:border-blue-400/40"
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
            <option value="canary">Canary</option>
          </select>
        </Field>
        <Field label="自动检查更新">
          <Toggle enabled={config.update.autoCheck} onChange={v => update('update', 'autoCheck', v)} />
        </Field>
        <Field label="自动下载更新">
          <Toggle enabled={config.update.autoDownload} onChange={v => update('update', 'autoDownload', v)} />
        </Field>
      </Section>
    </div>
  )
}
