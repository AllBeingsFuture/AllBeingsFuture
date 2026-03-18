import { Command, FolderKanban, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useTaskStore } from '../../stores/taskStore'
import { useUIStore } from '../../stores/uiStore'

interface QuickOpenItem {
  id: string
  title: string
  subtitle: string
  kind: 'session' | 'task'
}

export default function QuickOpenDialog() {
  const sessions = useSessionStore((state) => state.sessions)
  const selectSession = useSessionStore((state) => state.select)
  const tasks = useTaskStore((state) => state.tasks)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const toggleQuickOpen = useUIStore((state) => state.toggleQuickOpen)

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        toggleQuickOpen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleQuickOpen])

  const items = useMemo(() => {
    const trimmed = query.trim().toLowerCase()

    const sessionItems: QuickOpenItem[] = sessions.map((session) => ({
      id: session.id,
      title: session.name,
      subtitle: `${session.providerId} · ${session.workingDirectory}`,
      kind: 'session',
    }))

    const taskItems: QuickOpenItem[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      subtitle: `${task.status} · ${task.workingDirectory || task.providerId || 'task'}`,
      kind: 'task',
    }))

    return [...sessionItems, ...taskItems]
      .filter((item) => !trimmed || `${item.title} ${item.subtitle}`.toLowerCase().includes(trimmed))
      .slice(0, 12)
  }, [query, sessions, tasks])

  const handleOpen = (item: QuickOpenItem) => {
    if (item.kind === 'session') {
      selectSession(item.id)
      setActiveView('sessions')
    } else {
      setActiveView('kanban')
    }

    toggleQuickOpen()
  }

  return (
    <div className="fixed inset-0 z-[72] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && toggleQuickOpen()}>
      <div className="flex max-h-[68vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/96 shadow-[0_28px_64px_rgba(15,23,42,0.42)]">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Command size={18} className="text-blue-200" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Quick Open: 会话、任务、工作目录..."
            className="flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <button type="button" onClick={toggleQuickOpen} className="titlebar-button" aria-label="关闭快速打开">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center text-slate-400">
              <Search size={28} className="text-blue-200/70" />
              <p className="mt-4 text-sm">没有匹配的入口</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">这块先承接 claudeops 的 Quick Open 位置，当前优先接入会话和任务跳转。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => handleOpen(item)}
                  className="flex w-full items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-400/25 hover:bg-blue-500/[0.08]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-blue-200">
                    {item.kind === 'session' ? <Sparkles size={14} /> : <FolderKanban size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 break-all text-xs leading-6 text-slate-400">{item.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span>Quick Open</span>
          <span>ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}
