import type { ReactNode } from 'react'
import { ChevronRight, FolderTree, History } from 'lucide-react'
import SessionItem from './SessionItem'
import type { DirectoryGroupCardProps, TimeGroupCardProps } from './types'

function GroupShell({
  title,
  subtitle,
  count,
  collapsed,
  onToggleCollapse,
  icon,
  children,
}: {
  title: string
  subtitle?: string
  count: number
  collapsed?: boolean
  onToggleCollapse?: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden transition-colors hover:border-white/[0.08]">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] group/header"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-gray-500 group-hover/header:text-gray-400 group-hover/header:bg-white/[0.06] transition-all">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-gray-300">{title}</p>
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500 font-medium min-w-[20px] text-center">
              {count}
            </span>
          </div>
          {subtitle && <p className="truncate text-[11px] text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}>
          <ChevronRight size={14} className="text-gray-600" />
        </div>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 px-2 py-2">
          <div className="mx-1 mb-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          {children}
        </div>
      )}
    </section>
  )
}

export function TimeGroupCard({
  group,
  selectedSessionId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onResume,
  onEnd,
  onRemove,
  agents,
}: TimeGroupCardProps) {
  return (
    <GroupShell
      title={group.title}
      count={group.sessions.length}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      icon={<History size={15} />}
    >
      {group.sessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          selected={session.id === selectedSessionId}
          onSelect={onSelect}
          onResume={onResume}
          onEnd={onEnd}
          onRemove={onRemove}
          agents={agents?.[session.id]}
        />
      ))}
    </GroupShell>
  )
}

export function DirectoryGroupCard({
  group,
  selectedSessionId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onResume,
  onEnd,
  onRemove,
  agents,
}: DirectoryGroupCardProps) {
  return (
    <GroupShell
      title={group.title}
      subtitle={group.subtitle}
      count={group.sessions.length}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      icon={<FolderTree size={15} />}
    >
      {group.sessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          selected={session.id === selectedSessionId}
          onSelect={onSelect}
          onResume={onResume}
          onEnd={onEnd}
          onRemove={onRemove}
          agents={agents?.[session.id]}
        />
      ))}
    </GroupShell>
  )
}
