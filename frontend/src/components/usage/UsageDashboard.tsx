/**
 * Usage Analytics Dashboard
 *
 * Displays token usage summary cards, a 30-day token trend bar chart,
 * and a session breakdown pie chart. Uses mock data for now; data
 * interfaces are designed for future API integration.
 *
 * Dependency: recharts (npm install recharts @types/recharts)
 * Install before using this component.
 */

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Zap, Clock, TrendingUp, Activity, RefreshCw } from 'lucide-react'

// ---- Data Interfaces (connect to real APIs later) ----

export interface UsageSummary {
  todayTokens: number
  totalTokens: number
  activeSessions: number
  runtimeHours: number
}

export interface DailyUsage {
  date: string
  inputTokens: number
  outputTokens: number
}

export interface SessionUsage {
  sessionName: string
  tokens: number
}

// ---- Mock Data ----

function generateMockDailyUsage(): DailyUsage[] {
  const data: DailyUsage[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    data.push({
      date: dateStr,
      inputTokens: Math.floor(Math.random() * 50000) + 5000,
      outputTokens: Math.floor(Math.random() * 30000) + 3000,
    })
  }
  return data
}

function generateMockSessionUsage(): SessionUsage[] {
  const names = [
    'UI Refactor', 'API Integration', 'Bug Fix Sprint',
    'Documentation', 'Testing Suite', 'Performance Opt',
  ]
  return names.map((name) => ({
    sessionName: name,
    tokens: Math.floor(Math.random() * 100000) + 10000,
  }))
}

function generateMockSummary(daily: DailyUsage[]): UsageSummary {
  const today = daily[daily.length - 1]
  const totalInput = daily.reduce((s, d) => s + d.inputTokens, 0)
  const totalOutput = daily.reduce((s, d) => s + d.outputTokens, 0)
  return {
    todayTokens: today ? today.inputTokens + today.outputTokens : 0,
    totalTokens: totalInput + totalOutput,
    activeSessions: Math.floor(Math.random() * 5) + 1,
    runtimeHours: Math.floor(Math.random() * 40) + 8,
  }
}

// ---- Formatting Helpers ----

const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ef4444', '#6b7280', '#38bdf8', '#4ade80']

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ---- Custom Tooltip ----

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

function BarTooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-bg-secondary px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-text-primary">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2" style={{ color: entry.color }}>
          <span>{entry.name === 'inputTokens' ? 'Input' : 'Output'}: </span>
          <span className="font-medium">{formatTokens(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Main Component ----

export default function UsageDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)

  // Generate mock data (re-generated on refresh)
  const dailyUsage = useMemo(() => generateMockDailyUsage(), [refreshKey])
  const sessionUsage = useMemo(() => generateMockSessionUsage(), [refreshKey])
  const summary = useMemo(() => generateMockSummary(dailyUsage), [dailyUsage])

  // Bar chart data with formatted dates
  const barData = useMemo(
    () => dailyUsage.map((d) => ({ ...d, date: formatDate(d.date) })),
    [dailyUsage],
  )

  // Pie chart data: top 7 sessions + "Other"
  const pieData = useMemo(() => {
    if (sessionUsage.length === 0) return []
    const sorted = [...sessionUsage].sort((a, b) => b.tokens - a.tokens)
    const top = sorted.slice(0, 7)
    const rest = sorted.slice(7)
    const result = top.map((s) => ({
      name: s.sessionName.length > 12 ? s.sessionName.slice(0, 12) + '...' : s.sessionName,
      value: s.tokens,
    }))
    if (rest.length > 0) {
      result.push({
        name: `Other (${rest.length})`,
        value: rest.reduce((sum, s) => sum + s.tokens, 0),
      })
    }
    return result
  }, [sessionUsage])

  // Suppress the unused variable warning — refreshKey is used by useMemo deps
  void refreshKey

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-accent-yellow" />
            <span className="text-[10px] text-text-muted">今日Token消耗</span>
          </div>
          <div className="text-base font-semibold text-accent-yellow">
            {formatTokens(summary.todayTokens)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-accent-green" />
            <span className="text-[10px] text-text-muted">总Token消耗</span>
          </div>
          <div className="text-base font-semibold text-accent-green">
            {formatTokens(summary.totalTokens)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-accent-blue" />
            <span className="text-[10px] text-text-muted">活跃会话数</span>
          </div>
          <div className="text-base font-semibold text-accent-blue">
            {summary.activeSessions}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-accent-purple" />
            <span className="text-[10px] text-text-muted">运行时长</span>
          </div>
          <div className="text-base font-semibold text-accent-purple">
            {summary.runtimeHours}h
          </div>
        </div>
      </div>

      {/* 30-day Token Trend Bar Chart */}
      {barData.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] text-text-muted">每日 Token 趋势 (30天)</span>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover"
              title="刷新数据"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatTokens}
              />
              <Tooltip content={<BarTooltipContent />} />
              <Bar dataKey="inputTokens" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={12} stackId="tokens" />
              <Bar dataKey="outputTokens" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={12} stackId="tokens" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#3b82f6]" />
              <span className="text-[10px] text-text-muted">Input</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#22c55e]" />
              <span className="text-[10px] text-text-muted">Output</span>
            </div>
          </div>
        </div>
      )}

      {/* Session Breakdown Pie Chart */}
      {pieData.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-primary p-2.5">
          <span className="text-[10px] text-text-muted">会话 Token 分布</span>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                paddingAngle={2}
                stroke="none"
              >
                {pieData.map((_entry, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown) => formatTokens(Number(value ?? 0))}
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#e2e8f0',
                }}
              />
              <Legend
                formatter={(value: string) => (
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>{value}</span>
                )}
                iconSize={8}
                wrapperStyle={{ fontSize: '10px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty State */}
      {barData.length === 0 && pieData.length === 0 && (
        <div className="py-6 text-center text-xs text-text-muted">
          <Zap className="mx-auto mb-2 h-8 w-8 opacity-20" />
          <p>暂无用量数据</p>
          <p className="mt-1 text-[10px]">开始使用会话后将自动记录</p>
        </div>
      )}
    </div>
  )
}
