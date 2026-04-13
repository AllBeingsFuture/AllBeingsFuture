/**
 * 时间线面板 - 展示会话中 AI 的实时活动事件流
 *
 * 从 sessionStore 的 messages 中提取工具调用、思考、回复等事件，
 * 以时间线形式呈现 AI 在后台执行的所有操作。
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Zap, Search, Filter } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { workbenchApi } from '../../app/api/workbench'
import { useSessionStore } from '../../stores/sessionStore'
import { ACTIVITY_CONFIG, STATUS_COLORS } from '../../constants/statusColors'

// ─── Types ──────────────────────────────────────────────

interface TimelineEvent {
  id: string
  type: string          // key in ACTIVITY_CONFIG
  detail: string        // short description
  timestamp: string     // ISO string or formatted
  tokens?: number
}

// ─── Tool name → event type mapping ─────────────────────

const TOOL_TYPE_MAP: Record<string, string> = {
  Read: 'file_read', read_file: 'file_read',
  Write: 'file_write', write_file: 'file_write',
  Edit: 'file_write', edit_file: 'file_write',
  create_file: 'file_create',
  Bash: 'command_execute', bash: 'command_execute', shell: 'command_execute',
  localShellCall: 'command_execute', local_shell_call: 'command_execute',
  Glob: 'search', Grep: 'search', grep: 'search', glob: 'search',
  WebSearch: 'search', WebFetch: 'search',
  ToolSearch: 'search',
  Agent: 'tool_use',
  NotebookEdit: 'file_write',
  TodoWrite: 'tool_use',
  Task: 'tool_use',
}

const STATUS_LABELS: Record<string, string> = {
  starting: '启动中', running: '运行中', idle: '空闲',
  waiting_input: '等待输入', paused: '已暂停', completed: '已完成',
  error: '出错', terminated: '已终止', interrupted: '已中断',
}

const TYPE_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'thinking', label: '思考' },
  { key: 'tool', label: '工具' },
  { key: 'command', label: '命令' },
  { key: 'reply', label: '回复' },
  { key: 'input', label: '输入' },
]

// ─── Helpers ────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (!s) return ''
  const oneLine = s.replace(/\n/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max) + '...' : oneLine
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function formatDuration(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function getToolDetail(name: string, input: any): string {
  if (!input) return name
  if (input.command) return truncate(input.command, 80)
  if (input.file_path || input.path) return input.file_path || input.path
  if (input.pattern) return `pattern: ${input.pattern}`
  if (input.description) return truncate(input.description, 80)
  return name
}

function matchesFilter(event: TimelineEvent, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'thinking') return event.type === 'thinking'
  if (filter === 'tool') return ['tool_use', 'file_read', 'file_write', 'file_create', 'file_delete', 'search'].includes(event.type)
  if (filter === 'command') return event.type === 'command_execute'
  if (filter === 'reply') return event.type === 'assistant_message' || event.type === 'turn_complete'
  if (filter === 'input') return event.type === 'user_input'
  return true
}

// ─── Extract timeline events from messages ──────────────

function messagesToEvents(
  messages: any[],
  streaming: boolean,
  sessionStartedAt?: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  let eventCounter = 0

  // Session start event
  if (sessionStartedAt) {
    events.push({
      id: `ev-start`,
      type: 'session_start',
      detail: `Session started in ${sessionStartedAt}`,
      timestamp: sessionStartedAt,
    })
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const ts = msg.timestamp || new Date().toISOString()

    if (msg.role === 'tool_use' && msg.toolName) {
      const toolType = TOOL_TYPE_MAP[msg.toolName] || 'tool_use'
      events.push({
        id: `ev-${eventCounter++}`,
        type: toolType,
        detail: getToolDetail(msg.toolName, msg.toolInput),
        timestamp: ts,
      })
      continue
    }

    if (msg.role === 'user') {
      events.push({
        id: `ev-${eventCounter++}`,
        type: 'user_input',
        detail: truncate(msg.content, 120),
        timestamp: ts,
      })
      continue
    }

    if (msg.role === 'assistant' || msg.role === 'system') {
      // Thinking event
      if (msg.thinking) {
        events.push({
          id: `ev-${eventCounter++}`,
          type: 'thinking',
          detail: truncate(msg.thinking, 120),
          timestamp: ts,
        })
      }

      // Tool use events
      if (msg.toolUse && Array.isArray(msg.toolUse)) {
        for (const tool of msg.toolUse) {
          const toolType = TOOL_TYPE_MAP[tool.name] || 'tool_use'
          events.push({
            id: `ev-${eventCounter++}`,
            type: toolType,
            detail: getToolDetail(tool.name, tool.input),
            timestamp: ts,
          })
        }
      }

      // Reply event (only for non-empty content)
      if (msg.content && msg.content.trim()) {
        const isStreaming = i === messages.length - 1 && streaming
        events.push({
          id: `ev-${eventCounter++}`,
          type: 'assistant_message',
          detail: isStreaming
            ? `正在回复... (${msg.content.length} 字符)`
            : truncate(msg.content, 120),
          timestamp: ts,
        })
      }

      // Turn complete (after the last assistant message when not streaming)
      const isLastMsg = i === messages.length - 1
      if (isLastMsg && !streaming && msg.content) {
        events.push({
          id: `ev-${eventCounter++}`,
          type: 'turn_complete',
          detail: `Turn completed (waiting for next input, tokens: ${msg.content.length})`,
          timestamp: ts,
        })
      }
    }

    // Handle 'thinking' role messages
    if (msg.role === 'thinking' || msg.isThinking) {
      events.push({
        id: `ev-${eventCounter++}`,
        type: 'thinking',
        detail: truncate(msg.content, 120),
        timestamp: ts,
      })
    }
  }

  return events
}

// ─── Component ──────────────────────────────────────────

export default function TimelinePanel() {
  const { sessions, selectedId, messages, streaming } = useSessionStore(
    useShallow((state) => ({
      sessions: state.sessions,
      selectedId: state.selectedId,
      messages: state.messages,
      streaming: state.streaming,
    })),
  )
  const [duration, setDuration] = useState('-')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Auto-select first active session
  useEffect(() => {
    if (selectedId) return
    const activeSession = sessions.find(
      s => s.status === 'running' || s.status === 'idle' || s.status === 'waiting_input'
    )
    if (activeSession) {
      void workbenchApi.navigation.openSession(activeSession.id)
    }
  }, [sessions, selectedId])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [selectedId, sessions],
  )

  // Duration timer
  useEffect(() => {
    if (!selectedSession?.startedAt) { setDuration('-'); return }
    if (['completed', 'terminated'].includes(selectedSession.status)) {
      setDuration(formatDuration(selectedSession.startedAt)); return
    }
    const update = () => setDuration(formatDuration(selectedSession.startedAt!))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [selectedSession?.id, selectedSession?.status, selectedSession?.startedAt])

  // Build timeline events from messages
  const events = useMemo(
    () => messagesToEvents(messages, streaming, selectedSession?.startedAt),
    [messages, streaming, selectedSession?.startedAt],
  )

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events
    if (typeFilter !== 'all') {
      result = result.filter(e => matchesFilter(e, typeFilter))
    }
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase()
      result = result.filter(e => e.detail.toLowerCase().includes(q) || e.type.includes(q))
    }
    return result
  }, [deferredSearchQuery, events, typeFilter])

  // Reversed for display (newest first)
  const displayEvents = useMemo(() => [...filteredEvents].reverse(), [filteredEvents])

  // Scroll tracking
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottom.current = el.scrollTop < 50 // near top = newest items
  }

  // Reset scroll when switching sessions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    isNearBottom.current = true
  }, [selectedId])

  // Auto-scroll on new events
  useEffect(() => {
    if (isNearBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length])

  if (!selectedId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-text-muted text-sm">
          <p>未选择会话</p>
          <p className="mt-2 text-xs">点击侧边栏会话查看详情</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Session header */}
      {selectedSession && (
        <div className="shrink-0 p-3 border-b border-border">
          <div className="p-2.5 rounded-lg bg-bg-primary border border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-text-primary truncate">
                {selectedSession.name || '未命名会话'}
              </span>
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: (STATUS_COLORS[selectedSession.status] || '#8B949E') + '20',
                  color: STATUS_COLORS[selectedSession.status] || '#8B949E',
                }}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${selectedSession.status === 'running' ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: STATUS_COLORS[selectedSession.status] || '#8B949E' }}
                />
                {STATUS_LABELS[selectedSession.status] || selectedSession.status}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {duration}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" /> {events.length} 事件
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter bar */}
      <div className="shrink-0 px-3 pt-2 pb-1 space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索事件..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <Filter className="w-3 h-3 text-text-muted shrink-0" />
          {TYPE_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors ${
                typeFilter === opt.key
                  ? 'bg-accent-blue/20 text-accent-blue font-medium'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="shrink-0 px-3 pt-1 pb-1">
        <h3 className="text-xs font-medium text-text-secondary">活动时间线</h3>
      </div>

      {/* Timeline events */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 pb-3"
      >
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Zap className="w-6 h-6 mb-2 opacity-20" />
            <p className="text-xs">
              {streaming ? '等待 AI 操作...' : '暂无活动事件'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayEvents.map((event) => {
              const config = ACTIVITY_CONFIG[event.type] || ACTIVITY_CONFIG.unknown_activity
              const Icon = config.icon
              return (
                <div
                  key={event.id}
                  className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  {/* Timestamp */}
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0 mt-0.5 w-14 text-right">
                    {formatTime(event.timestamp)}
                  </span>

                  {/* Type badge */}
                  <div
                    className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium mt-px"
                    style={{
                      backgroundColor: config.color + '18',
                      color: config.color,
                    }}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{config.label}</span>
                  </div>

                  {/* Detail */}
                  <p className="text-[11px] text-text-secondary leading-relaxed min-w-0 break-all line-clamp-2 mt-px">
                    {event.detail}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
