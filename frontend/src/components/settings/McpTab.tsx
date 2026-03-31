import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, Server, Wrench } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { MCPService } from '../../../bindings/allbeingsfuture/internal/services'
import { useMcpStore, type MCPServer } from '../../stores/mcpStore'

type RuntimeCheck = {
  name: string
  ok: boolean
  message: string
}

type McpRuntimeInfo = {
  id: string
  instructions?: string
  ready: boolean
  resolvedCommand?: string
  checks?: RuntimeCheck[]
}

const categoryLabels: Record<string, string> = {
  all: '全部',
  browser: '浏览器',
  code: '代码',
  custom: '自定义',
  database: '数据库',
  filesystem: '文件系统',
  web: '网络',
}

const CARD_CONTENT_VISIBILITY_STYLE: CSSProperties = {
  contain: 'layout paint style',
  contentVisibility: 'auto',
  containIntrinsicSize: '240px',
}

const formatProviders = (providers: string[] | 'all' | undefined) => {
  if (!providers || providers === 'all') {
    return '所有 Provider'
  }
  return providers.join(' / ')
}

interface McpCardProps {
  server: MCPServer
  info?: McpRuntimeInfo
  isExpanded: boolean
  isDetailLoading: boolean
  optimizeRendering: boolean
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>
  onToggleDetails: (id: string) => Promise<void>
}

const McpCard = memo(function McpCard({
  server,
  info,
  isExpanded,
  isDetailLoading,
  optimizeRendering,
  onToggleEnabled,
  onToggleDetails,
}: McpCardProps) {
  const ready = info?.ready

  return (
    <div
      className="rounded-xl border border-dark-border bg-dark-bg/70 p-4"
      style={optimizeRendering ? CARD_CONTENT_VISIBILITY_STYLE : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Server size={15} className="text-blue-400" />
            <h5 className="text-sm font-medium text-white">{server.name}</h5>
            <span className="rounded-full bg-dark-border px-2 py-0.5 text-[10px] text-gray-300">
              {server.transport}
            </span>
            <span className="rounded-full bg-dark-border px-2 py-0.5 text-[10px] text-gray-300">
              {server.source}
            </span>
            {typeof ready === 'boolean' ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                }`}
              >
                {ready ? '就绪' : '需处理'}
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-gray-400">{server.description || '暂无描述'}</p>
        </div>

        <button
          role="switch"
          aria-checked={server.enabled}
          title={server.enabled ? '点击禁用' : '点击启用'}
          onClick={() => void onToggleEnabled(server.id, !server.enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            server.enabled ? 'bg-emerald-500' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              server.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-400">
        <span className="rounded bg-dark-border px-2 py-0.5">
          分类: {categoryLabels[server.category] ?? server.category}
        </span>
        <span className="rounded bg-dark-border px-2 py-0.5">工具数: {server.toolCount}</span>
        <span className="rounded bg-dark-border px-2 py-0.5">
          兼容: {formatProviders(server.compatibleProviders)}
        </span>
        {server.hasInstructions ? (
          <span className="rounded bg-blue-500/15 px-2 py-0.5 text-blue-300">含使用说明</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 text-xs text-gray-400">
        {server.command ? (
          <div className="rounded-lg border border-dark-border bg-[#111827] px-3 py-2 font-mono text-[11px] text-gray-300">
            {server.command}
            {server.args.length ? ` ${server.args.join(' ')}` : ''}
          </div>
        ) : null}

        {!server.isInstalled && server.installCommand ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-200">
            <Wrench size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">运行前需要安装依赖</div>
              <div className="mt-1 font-mono text-[11px] text-amber-100">{server.installCommand}</div>
            </div>
          </div>
        ) : null}

        {server.path ? (
          <div>
            目录: <code>{server.path}</code>
          </div>
        ) : null}

        {server.homepage ? (
          <a
            href={server.homepage}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
          >
            查看主页
            <ExternalLink size={12} />
          </a>
        ) : null}
      </div>

      <div className="mt-4">
        <button
          onClick={() => void onToggleDetails(server.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white"
        >
          {isDetailLoading ? <Loader2 size={12} className="animate-spin" /> : isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {isExpanded ? '收起详情' : '检查详情'}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-4 space-y-4 rounded-xl border border-dark-border bg-[#0f172a]/60 p-4">
          <div>
            <div className="mb-2 text-xs font-medium text-white">运行检查</div>
            {info?.checks?.length ? (
              <div className="space-y-2">
                {info.checks.map((check) => (
                  <div
                    key={`${server.id}-${check.name}-${check.message}`}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      check.ok
                        ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                        : 'border-red-500/20 bg-red-500/5 text-red-200'
                    }`}
                  >
                    <div className="font-medium">{check.name}</div>
                    <div className="mt-1 leading-5">{check.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">{isDetailLoading ? '正在检查…' : '暂无检查结果'}</div>
            )}
            {info?.resolvedCommand ? (
              <div className="mt-3 rounded-lg border border-dark-border bg-[#111827] px-3 py-2 font-mono text-[11px] text-gray-300">
                {info.resolvedCommand}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-white">MCP 说明</div>
            <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-dark-border bg-[#111827] px-3 py-2 text-xs leading-6 text-gray-300">
              {info?.instructions || (isDetailLoading ? '正在加载…' : '暂无说明')}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}, (prev, next) => (
  prev.server === next.server
  && prev.info === next.info
  && prev.isExpanded === next.isExpanded
  && prev.isDetailLoading === next.isDetailLoading
  && prev.optimizeRendering === next.optimizeRendering
))

export default function McpTab() {
  const { servers, loading, load, toggleEnabled } = useMcpStore(useShallow((state) => ({
    servers: state.servers,
    loading: state.loading,
    load: state.load,
    toggleEnabled: state.toggleEnabled,
  })))
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [runtime, setRuntime] = useState<Record<string, McpRuntimeInfo>>({})
  const [runtimeLoadingId, setRuntimeLoadingId] = useState<string | null>(null)
  const expandedRef = useRef(expanded)
  const runtimeRef = useRef(runtime)
  const deferredServers = useDeferredValue(servers)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

  const handleRefresh = useCallback(() => {
    void load(true)
  }, [load])

  const handleCategoryChange = useCallback((category: string) => {
    startTransition(() => {
      setSelectedCategory(category)
    })
  }, [])

  const handleToggleDetails = useCallback(async (serverId: string) => {
    if (expandedRef.current[serverId]) {
      setExpanded((state) => ({ ...state, [serverId]: false }))
      return
    }

    setExpanded((state) => ({ ...state, [serverId]: true }))
    if (runtimeRef.current[serverId]) return

    setRuntimeLoadingId(serverId)
    try {
      const info = await MCPService.GetRuntimeInfo(serverId)
      if (info) {
        setRuntime((state) => (
          state[serverId]
            ? state
            : { ...state, [serverId]: info as McpRuntimeInfo }
        ))
      }
    } finally {
      setRuntimeLoadingId((current) => (current === serverId ? null : current))
    }
  }, [])

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(deferredServers.map((server) => server.category || 'custom')))],
    [deferredServers],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deferredServers.length }

    for (const server of deferredServers) {
      const category = server.category || 'custom'
      counts[category] = (counts[category] ?? 0) + 1
    }

    return counts
  }, [deferredServers])

  const visibleServers = useMemo(
    () => (
      selectedCategory === 'all'
        ? deferredServers
        : deferredServers.filter((server) => (server.category || 'custom') === selectedCategory)
    ),
    [deferredServers, selectedCategory],
  )

  const optimizeRendering = visibleServers.length > 10

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">MCP 服务</h4>
          <p className="mt-1 text-xs text-gray-500">
            当前列表来自应用内嵌的 MCP 资源和数据库状态。启用后的服务会在新会话启动时自动注入 Provider 配置。
          </p>
          <p className="mt-1 text-xs text-gray-500">
            现在可以直接查看 MCP 说明、命令解析结果和本地就绪检查，不再只是静态占位列表。
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => handleCategoryChange(category)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              selectedCategory === category
                ? 'border-blue-500 bg-blue-500/10 text-white'
                : 'border-dark-border text-gray-400 hover:text-white'
            }`}
          >
            {categoryLabels[category] ?? category}
            <span className="ml-1 text-[10px] opacity-70">{categoryCounts[category] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {visibleServers.map((server) => (
          <McpCard
            key={server.id}
            server={server}
            info={runtime[server.id]}
            isExpanded={!!expanded[server.id]}
            isDetailLoading={runtimeLoadingId === server.id}
            optimizeRendering={optimizeRendering}
            onToggleEnabled={toggleEnabled}
            onToggleDetails={handleToggleDetails}
          />
        ))}
      </div>

      {!loading && visibleServers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-border py-12 text-center">
          <Server size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm text-gray-400">当前分类下没有可用 MCP 服务</p>
          <p className="mt-1 text-xs text-gray-500">
            更新内嵌 MCP 资源后点击刷新即可重新同步。
          </p>
        </div>
      ) : null}
    </div>
  )
}
