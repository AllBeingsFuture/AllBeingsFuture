import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, Search, FolderKanban, Plus, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
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
  const {
    sessions,
    selectedId,
    selectSession,
    endSession,
    removeSession,
    resumeSession,
    agents,
    childToParent,
    fetchAllAgents,
  } = useSessionStore(useShallow((state) => ({
    sessions: state.sessions,
    selectedId: state.selectedId,
    selectSession: state.select,
    endSession: state.end,
    removeSession: state.remove,
    resumeSession: state.resumeSession,
    agents: state.agents,
    childToParent: state.childToParent,
    fetchAllAgents: state.fetchAllAgents,
  })))

  const { teamInstances, loadInstances } = useTeamStore(useShallow((state) => ({
    teamInstances: state.instances,
    loadInstances: state.loadInstances,
  })))

  const { setActiveView, toggleSearchPanel, setShowNewSessionDialog } = useUIStore(
    useShallow((state) => ({
      setActiveView: state.setActiveView,
      toggleSearchPanel: state.toggleSearchPanel,
      setShowNewSessionDialog: state.setShowNewSessionDialog,
    })),
  )

  const [groupMode, setGroupMode] = useState<SidebarGroupMode>(() => readInitialGroupMode())
  const [query, setQuery] = useState('')
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [searchFocused, setSearchFocused] = useState(false)
  const deferredQuery = useDeferredValue(query)

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

  const { filteredSessions, activeSessions } = useMemo(() => {
    const sessionIds = new Set(sessions.map((session) => session.id))
    const nextFilteredSessions: typeof sessions = []
    let activeSessions = 0

    for (const session of sessions) {
      if (ACTIVE_STATUSES.has(session.status)) {
        activeSessions++
      }

      // Hide child sessions only if their parent exists in the session list.
      const parentId = childToParent[session.id]?.parentSessionId || (session as any).parentSessionId
      if (parentId && sessionIds.has(parentId)) continue
      if (!matchesSessionQuery(session, deferredQuery)) continue
      nextFilteredSessions.push(session)
    }

    return {
      filteredSessions: nextFilteredSessions,
      activeSessions,
    }
  }, [childToParent, deferredQuery, sessions])

  const timeGroups = useMemo(() => groupSessionsByTime(filteredSessions), [filteredSessions])
  const directoryGroups = useMemo(() => groupSessionsByDirectory(filteredSessions), [filteredSessions])

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

  const runningTeams = useMemo(
    () => teamInstances.reduce((count, instance) => count + (instance.status === 'running' ? 1 : 0), 0),
    [teamInstances],
  )

  const emptyStateMessage = deferredQuery.trim()
    ? '没有匹配的会话'
    : '暂无会话，点击下方按钮创建'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0c0c0c]" data-testid="sessions-sidebar">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#1e1e1e]">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-700 tracking-[0.18em] uppercase text-[#555]">SESSIONS</span>
            <span className={`text-[9px] font-600 tabular-nums ${activeSessions > 0 ? 'text-[#3eb550]' : 'text-[#444]'}`}>
              {activeSessions > 0 ? `${activeSessions} ACTIVE` : sessions.length}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowNewSessionDialog(true)}
              className="flex h-6 w-6 items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#ff4f1a] transition-all duration-150"
              title="新建会话"
            >
              <MessageSquarePlus size={13} />
            </button>
            <button
              type="button"
              onClick={() => setShowTaskDialog(true)}
              className="flex h-6 w-6 items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#ff4f1a] transition-all duration-150"
              title="新建任务"
            >
              <FolderKanban size={13} />
            </button>
            <button
              type="button"
              onClick={toggleSearchPanel}
              className="flex h-6 w-6 items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#ff4f1a] transition-all duration-150"
              title="搜索"
            >
              <Search size={13} />
            </button>
          </div>
        </div>

        <div className={[
          'flex items-center gap-2 border px-2.5 py-1.5 transition-all duration-150',
          searchFocused ? 'border-[#ff4f1a]/30 bg-[#111]' : 'border-[#1e1e1e] bg-[#0c0c0c] hover:border-[#2e2e2e]',
        ].join(' ')}>
          <Search size={11} className={`shrink-0 ${searchFocused ? 'text-[#ff4f1a]' : 'text-[#3a3a3a]'}`} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="SEARCH..."
            className="w-full border-0 bg-transparent text-[11px] text-[#aaa] outline-none placeholder:text-[#333] placeholder:tracking-wider placeholder:font-600 placeholder:text-[9px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="shrink-0 text-[#444] hover:text-[#888] transition-colors text-xs"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] font-600 tracking-widest uppercase text-[#3a3a3a]">GROUP</span>
          <GroupByToggle value={groupMode} onChange={setGroupMode} />
        </div>
      </div>

      {/* No divider — border-b on header does the job */}

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
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center px-4">
            <Sparkles size={14} className="text-[#2e2e2e]" />
            <p className="text-[10px] text-[#333] uppercase tracking-wider font-600">{emptyStateMessage}</p>
          </div>
        )}
      </div>

      {/* Teams footer */}
      {teamInstances.length > 0 && (
        <div className="border-t border-[#1e1e1e] px-3 py-2">
          <button
            type="button"
            onClick={() => setActiveView('teams')}
            className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-widest text-[#444] hover:bg-[#111] hover:text-[#888] transition-all duration-150"
          >
            <span>TEAMS {runningTeams > 0 && <span className="text-[#3eb550]">({runningTeams} RUNNING)</span>}</span>
            <span className="text-[#333]">{teamInstances.length}</span>
          </button>
        </div>
      )}

      {/* Bottom new session button */}
      <div className="shrink-0 px-3 pb-3 pt-2 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowNewSessionDialog(true)}
          className="w-full bg-[#ff4f1a] py-2 text-[10px] font-700 tracking-[0.12em] uppercase text-white transition-all duration-150 hover:bg-[#e63d06] active:scale-[0.99]"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Plus size={12} strokeWidth={2.5} />
            NEW SESSION
          </span>
        </button>
      </div>

      {showTaskDialog && <NewTaskDialog onClose={() => setShowTaskDialog(false)} />}
    </div>
  )
}
