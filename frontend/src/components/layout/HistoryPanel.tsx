import { Clock3, History, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'

const HISTORY_STATUSES = new Set(['completed', 'terminated', 'error'])

export default function HistoryPanel() {
  const sessions = useSessionStore((state) => state.sessions)
  const selectSession = useSessionStore((state) => state.select)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const toggleHistoryPanel = useUIStore((state) => state.toggleHistoryPanel)

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        toggleHistoryPanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleHistoryPanel])

  const historySessions = useMemo(() => {
    const trimmed = query.trim().toLowerCase()

    return [...sessions]
      .filter((session) => HISTORY_STATUSES.has(session.status))
      .filter((session) => {
        if (!trimmed) return true
        return [session.name, session.workingDirectory, session.providerId, session.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(trimmed)
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }, [query, sessions])

  const handleOpenSession = (sessionId: string) => {
    selectSession(sessionId)
    setActiveView('sessions')
    toggleHistoryPanel()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && toggleHistoryPanel()}>
      <div className="flex max-h-[72vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/96 shadow-[0_28px_64px_rgba(15,23,42,0.42)]">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <History size={18} className="text-blue-200" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索历史会话..."
            className="flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <button type="button" onClick={toggleHistoryPanel} className="titlebar-button" aria-label="关闭历史面板">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto px-3 py-3">
          {historySessions.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-slate-400">
              <Search size={28} className="text-blue-200/70" />
              <p className="mt-4 text-sm">当前没有匹配的历史会话</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">这里会继续对齐 claudeops 的 history overlay，后续再补 resume / rename 等动作。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historySessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleOpenSession(session.id)}
                  className="flex w-full items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-400/25 hover:bg-blue-500/[0.08]"
                >
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-blue-200">
                    <Clock3 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-white">{session.name}</p>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        {session.status}
                      </span>
                    </div>
                    <p className="mt-2 break-all text-xs leading-6 text-slate-400">{session.workingDirectory}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <span>{session.providerId}</span>
                      <span>·</span>
                      <span>{new Date(session.startedAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span>Session History</span>
          <span>ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}
