import { Search, Sparkles, X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { workbenchApi } from '../../app/api/workbench'
import { useSessionStore } from '../../stores/sessionStore'

interface SearchResult {
  id: string
  title: string
  detail: string
  excerpt?: string
}

export default function SearchPanel() {
  const { sessions, selectedId, messages } = useSessionStore(
    useShallow((state) => ({
      sessions: state.sessions,
      selectedId: state.selectedId,
      messages: state.messages,
    })),
  )
  const closeSearchPanel = () => {
    void workbenchApi.ui.toggleSearchPanel()
  }

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSearchPanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase()
    if (!trimmed) return []

    const sessionResults: SearchResult[] = sessions
      .filter((session) => {
        const haystack = [session.name, session.workingDirectory, session.providerId, session.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(trimmed)
      })
      .slice(0, 10)
      .map((session) => ({
        id: session.id,
        title: session.name,
        detail: `${session.providerId} · ${session.status}`,
        excerpt: session.workingDirectory,
      }))

    const selectedSession = sessions.find((session) => session.id === selectedId)
    const messageResults: SearchResult[] = selectedSession
      ? messages
          .filter((message) => (message.content || '').toLowerCase().includes(trimmed))
          .slice(0, 5)
          .map((message, index) => ({
            id: `${selectedSession.id}-message-${index}`,
            title: selectedSession.name,
            detail: message.role,
            excerpt: message.content,
          }))
      : []

    return [...sessionResults, ...messageResults]
  }, [deferredQuery, messages, selectedId, sessions])

  const handleSelectResult = (resultId: string) => {
    const sessionId = resultId.includes('-message-') ? resultId.split('-message-')[0] : resultId
    void workbenchApi.navigation.openSession(sessionId)
    closeSearchPanel()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && closeSearchPanel()}>
      <div className="flex max-h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/96 shadow-[0_28px_64px_rgba(15,23,42,0.42)]">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Search size={18} className="text-blue-200" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话、目录、Provider 或当前会话消息..."
            className="flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <button type="button" onClick={closeSearchPanel} className="titlebar-button" aria-label="关闭搜索">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3">
          {!deferredQuery.trim() && (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center text-slate-400">
              <Sparkles size={28} className="text-blue-200/70" />
              <p className="mt-4 text-sm">这块对齐 claudeops 的全局搜索浮层，当前先接入会话和消息搜索。</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">输入关键字后会优先返回命中的会话卡片，其次返回当前会话中的消息片段。</p>
            </div>
          )}

          {deferredQuery.trim() && results.length === 0 && (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-slate-400">
              <p className="text-sm">没有找到匹配结果</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">可以尝试目录名、Provider、状态或消息内容关键字。</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => handleSelectResult(result.id)}
                  className="flex w-full items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-400/25 hover:bg-blue-500/[0.08]"
                >
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-blue-200">
                    <Search size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-white">{result.title}</p>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        {result.detail}
                      </span>
                    </div>
                    {result.excerpt && <p className="mt-2 break-all text-xs leading-6 text-slate-400">{result.excerpt}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span>Global Search</span>
          <span>ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}
