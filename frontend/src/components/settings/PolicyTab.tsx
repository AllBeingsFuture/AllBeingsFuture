import { useState, useEffect } from 'react'
import { usePolicyStore } from '../../stores/policyStore'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  Plus, X, RefreshCw, Trash2, Clock,
  Terminal, FolderLock, AlertTriangle,
} from 'lucide-react'

export default function PolicyTab() {
  const {
    config, auditLog, loading, error,
    loadConfig, setAutoConfirm,
    addBlockedCommand, removeBlockedCommand,
    addBlockedPath, removeBlockedPath,
    loadAuditLog, clearAuditLog, reloadConfig,
  } = usePolicyStore()

  const [newCommand, setNewCommand] = useState('')
  const [newPath, setNewPath] = useState('')
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleAddCommand = async () => {
    if (newCommand.trim()) {
      await addBlockedCommand(newCommand.trim())
      setNewCommand('')
    }
  }

  const handleAddPath = async () => {
    if (newPath.trim()) {
      await addBlockedPath(newPath.trim())
      setNewPath('')
    }
  }

  const handleToggleAudit = async () => {
    if (!showAudit) {
      await loadAuditLog(50)
    }
    setShowAudit(!showAudit)
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <RefreshCw size={16} className="mr-2 animate-spin" />
        加载策略配置...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Auto-confirm toggle */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.autoConfirm ? (
              <ShieldAlert size={20} className="text-yellow-400" />
            ) : (
              <ShieldCheck size={20} className="text-green-400" />
            )}
            <div>
              <h4 className="text-sm font-medium text-white">危险操作确认</h4>
              <p className="text-xs text-slate-400 mt-1">
                {config.autoConfirm
                  ? '已关闭 — 危险操作将自动执行，不需要用户确认'
                  : '已开启 — 检测到危险操作时会要求用户确认'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setAutoConfirm(!config.autoConfirm)}
            className={[
              'relative h-6 w-11 rounded-full transition',
              config.autoConfirm ? 'bg-yellow-500/40' : 'bg-green-500/40',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                config.autoConfirm ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {/* Blocked Commands */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={16} className="text-red-400" />
          <h4 className="text-sm font-medium text-white">命令黑名单</h4>
          <span className="ml-auto text-xs text-slate-500">
            {config.scopePolicy.blockedCommands.length} 条规则
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {config.scopePolicy.blockedCommands.map((cmd) => (
            <span
              key={cmd}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300"
            >
              <code>{cmd}</code>
              <button
                onClick={() => removeBlockedCommand(cmd)}
                className="text-red-400 hover:text-red-200 transition"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="添加命令..."
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCommand()}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400/40"
          />
          <button
            onClick={handleAddCommand}
            className="flex items-center gap-1 rounded-lg bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/30 transition"
          >
            <Plus size={12} />
            添加
          </button>
        </div>
      </div>

      {/* Blocked Paths */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderLock size={16} className="text-orange-400" />
          <h4 className="text-sm font-medium text-white">路径黑名单</h4>
          <span className="ml-auto text-xs text-slate-500">
            {config.scopePolicy.blockedPaths.length} 条规则
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          {config.scopePolicy.blockedPaths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2"
            >
              <code className="text-xs text-orange-300">{path}</code>
              <button
                onClick={() => removeBlockedPath(path)}
                className="text-orange-400 hover:text-orange-200 transition"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="添加路径模式 (支持 glob)..."
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400/40"
          />
          <button
            onClick={handleAddPath}
            className="flex items-center gap-1 rounded-lg bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/30 transition"
          >
            <Plus size={12} />
            添加
          </button>
        </div>
      </div>

      {/* Dangerous Patterns */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-yellow-400" />
          <h4 className="text-sm font-medium text-white">危险模式规则</h4>
        </div>

        {config.toolPolicies.map((rule, ruleIdx) => (
          <div key={rule.toolName} className="mb-3 last:mb-0">
            <p className="text-xs text-slate-400 mb-2">
              工具: <code className="text-blue-300">{rule.toolName}</code>
              {rule.requireConfirmation && (
                <span className="ml-2 text-yellow-400">(需确认)</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rule.dangerousPatterns.map((pattern, i) => (
                <span
                  key={i}
                  className="rounded bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 text-xs text-yellow-300 font-mono"
                >
                  {pattern}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => reloadConfig()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          <RefreshCw size={14} />
          重新加载 YAML
        </button>
        <button
          onClick={handleToggleAudit}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          <Clock size={14} />
          {showAudit ? '隐藏审计日志' : '查看审计日志'}
        </button>
      </div>

      {/* Audit Log */}
      {showAudit && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-slate-400" />
              <h4 className="text-sm font-medium text-white">审计日志</h4>
            </div>
            <button
              onClick={clearAuditLog}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-300 transition"
            >
              <Trash2 size={12} />
              清除
            </button>
          </div>

          {auditLog.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">暂无审计记录</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {auditLog.map((entry, i) => (
                <div
                  key={i}
                  className={[
                    'rounded-lg border px-3 py-2 text-xs',
                    entry.decision === 'deny'
                      ? 'border-red-500/20 bg-red-500/5 text-red-300'
                      : entry.decision === 'confirm'
                      ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'
                      : 'border-white/10 bg-white/5 text-slate-300',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5">
                      {entry.decision === 'deny' ? (
                        <ShieldX size={12} />
                      ) : entry.decision === 'confirm' ? (
                        <ShieldAlert size={12} />
                      ) : (
                        <ShieldCheck size={12} />
                      )}
                      <code>{entry.toolName}</code>
                    </span>
                    <span className="text-slate-500">
                      {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-400">{entry.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
