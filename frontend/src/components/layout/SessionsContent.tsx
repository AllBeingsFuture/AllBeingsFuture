import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, Search, FolderKanban, Plus, Sparkles } from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { useTeamStore } from '../../stores/teamStore'
import { useUIStore } from '../../stores/uiStore'
import GroupByToggle from './sidebar/GroupByToggle'
import NewTaskDialog from './sidebar/NewTaskDialog'
import { DirectoryGroupCard, TimeGroupCard } from './sidebar/SessionGroupCards'
import type { DirectoryGroup, SidebarGroupMode, TimeGroup } from './sidebar/types'
import { ACTIVE_STATUSES } from './sidebar/types'
import { groupSessionsByDirectory, groupSessionsByTime, matchesSessionQuery } from './sidebar/utils'

function readInitialGroupMode(): SidebarGroupMode {
  try {
    const stored = window.localStorage.getItem('sidebar-group-mode')
    if (stored === 'time' || stored === 'directory') {
      return stored
    }
  } catch {
    // Ignore storage failures.
  }
  return 'time'
}

export default function SessionsContent() {
  const sessions = useSessionStore((state) => state.sessions)
  const selectedId = useSessionStore((state) => state.selectedId)
  const selectSession = useSessionStore((state) => state.select)
  const endSession = useSessionStore((state) => state.end)
  const removeSession = useSessionStore((state) => state.remove)
  const resumeSession = useSessionStore((state) => state.resumeSession)
  const agents = useSessionStore((state) => state.agents)
  const childToParent = useSessionStore((state) => state.childToParent)
  const fetchAllAgents = useSessionStore((state) => state.fetchAllAgents)

  const teamInstances = useTeamStore((state) => state.instances)
  const loadInstances = useTeamStore((state) => state.loadInstances)

  const setActiveView = useUIStore((state) => state.setActiveView)
  const toggleSearchPanel = useUIStore((state) => state.toggleSearchPanel)
  const setShowNewSessionDialog = useUIStore((state) => state.setShowNewSessionDialog)

  const [groupMode, setGroupMode] = useState<SidebarGroupMode>(() => readInitialGroupMode())
  const [query, setQuery] = useState('')
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(() => {
    void loadInstances()
    void fetchAllAgents()
    const timer = setInterval(() => void fetchAllAgents(), 5000)
    return () => clearInterval(timer)
  }, [loadInstances, fetchAllAgents])

  useEffect(() => {
    try {
      window.localStorage.setItem('sidebar-group-mode', groupMode)
    } catch {
      // Ignore storage failures.
    }
  }, [groupMode])

  const filteredSessions = useMemo(
    () => sessions.filter((session) => {
      // Hide child sessions only if their parent exists in the session list
      const parentId = childToParent[session.id]?.parentSessionId || (session as any).parentSessionId
      if (parentId && sessions.some(s => s.id === parentId)) return false
      return matchesSessionQuery(session, query)
    }),
    [query, sessions, childToParent],
  )

  const timeGroups = useMemo(() => groupSessionsByTime(filteredSessions), [filteredSessions])
  const directoryGroups = useMemo(() => groupSessionsByDirectory(filteredSessions), [filteredSessions])

  const activeSessions = sessions.filter((session) => ACTIVE_STATUSES.has(session.status)).length

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleSelectSession = (id: string) => {
    selectSession(id)
    setActiveView('sessions')
  }

  const runningTeams = teamInstances.filter((i) => i.status === 'running').length

  const emptyStateMessage = query.trim()
    ? '没有匹配的会话'
    : '暂无会话，点击下方按钮创建'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-secondary" data-testid="sessions-sidebar">
      {/* Header */}
      <div className="px-3 pt-3.5 pb-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[13px] font-semibold text-text-primary tracking-wide">会话</h2>
            {activeSessions > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {activeSessions} 活跃
              </span>
            ) : (
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium tabular-nums text-text-muted">{sessions.length}</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowNewSessionDialog(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white/[0.08] hover:text-blue-400 transition-all duration-150"
              title="新建会话"
            >
              <MessageSquarePlus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowTaskDialog(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white/[0.08] hover:text-blue-400 transition-all duration-150"
              title="新建任务"
            >
              <FolderKanban size={14} />
            </button>
            <button
              type="button"
              onClick={toggleSearchPanel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white/[0.08] hover:text-blue-400 transition-all duration-150"
              title="搜索"
            >
              <Search size={14} />
            </button>
          </div>
        </div>

        <div className={[
          'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all duration-200',
          searchFocused
            ? 'border-blue-500/30 bg-white/[0.05] shadow-[0_0_0_1px_rgba(59,130,246,0.1)]'
            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.03]',
        ].join(' ')}>
          <Search size={13} className={`shrink-0 transition-colors duration-200 ${searchFocused ? 'text-blue-400' : 'text-gray-600'}`} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索会话..."
            className="w-full border-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-gray-600"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors"
            >
              <span className="text-xs">&#x2715;</span>
            </button>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[11px] text-gray-600">分组</span>
          <GroupByToggle value={groupMode} onChange={setGroupMode} />
        </div>
      </div>

      {/* Subtle divider */}
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {groupMode === 'time' && timeGroups.length > 0 && (
          <div className="space-y-2">
            {timeGroups.map((group: TimeGroup) => (
              <TimeGroupCard
                key={group.key}
                group={group}
                selectedSessionId={selectedId}
                collapsed={collapsedGroups[group.key]}
                onToggleCollapse={() => toggleGroup(group.key)}
                onSelect={handleSelectSession}
                onResume={(id) => void resumeSession(id)}
                onEnd={(id) => void endSession(id)}
                onRemove={(id) => void removeSession(id)}
                agents={agents}
              />
            ))}
          </div>
        )}

        {groupMode === 'directory' && directoryGroups.length > 0 && (
          <div className="space-y-2">
            {directoryGroups.map((group: DirectoryGroup) => (
              <DirectoryGroupCard
                key={group.key}
                group={group}
                selectedSessionId={selectedId}
                collapsed={collapsedGroups[group.key]}
                onToggleCollapse={() => toggleGroup(group.key)}
                onSelect={handleSelectSession}
                onResume={(id) => void resumeSession(id)}
                onEnd={(id) => void endSession(id)}
                onRemove={(id) => void removeSession(id)}
                agents={agents}
              />
            ))}
          </div>
        )}

        {((groupMode === 'time' && timeGroups.length === 0) || (groupMode === 'directory' && directoryGroups.length === 0)) && (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <Sparkles size={18} className="text-gray-600" />
            </div>
            <p className="text-xs text-gray-600">{emptyStateMessage}</p>
          </div>
        )}
      </div>

      {/* Teams footer */}
      {teamInstances.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <button
            type="button"
            onClick={() => setActiveView('teams')}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs text-gray-500 hover:bg-white/[0.05] hover:text-gray-300 transition-all duration-150"
          >
            <span>Teams {runningTeams > 0 && <span className="text-emerald-400 font-medium">({runningTeams} 运行中)</span>}</span>
            <span className="text-gray-600">{teamInstances.length}</span>
          </button>
        </div>
      )}

      {/* Bottom new session button */}
      <div className="shrink-0 px-3 pb-3 pt-2">
        <button
          onClick={() => setShowNewSessionDialog(true)}
          className="group/btn relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-2.5 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/30 hover:from-blue-500 hover:to-blue-400 active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" />
          <span className="relative flex items-center justify-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} />
            新建会话
          </span>
        </button>
      </div>

      {showTaskDialog && <NewTaskDialog onClose={() => setShowTaskDialog(false)} />}
    </div>
  )
}
