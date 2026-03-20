import type { Session, TeamInstance } from '../../../../bindings/allbeingsfuture/internal/models/models'

export type SidebarGroupMode = 'time' | 'directory'

export interface TimeGroup {
  key: string
  title: string
  sessions: Session[]
}

export interface DirectoryGroup {
  key: string
  title: string
  subtitle: string
  sessions: Session[]
}

export interface SessionItemProps {
  session: Session
  selected: boolean
  onSelect: (id: string) => void
  onResume?: (id: string) => void
  onEnd?: (id: string) => void
  onRemove?: (id: string) => void
  agents?: any[]
}

export interface TimeGroupCardProps {
  group: TimeGroup
  selectedSessionId: string | null
  collapsed?: boolean
  onToggleCollapse?: () => void
  onSelect: (id: string) => void
  onResume?: (id: string) => void
  onEnd?: (id: string) => void
  onRemove?: (id: string) => void
  agents?: Record<string, any[]>
}

export interface DirectoryGroupCardProps {
  group: DirectoryGroup
  selectedSessionId: string | null
  collapsed?: boolean
  onToggleCollapse?: () => void
  onSelect: (id: string) => void
  onResume?: (id: string) => void
  onEnd?: (id: string) => void
  onRemove?: (id: string) => void
  agents?: Record<string, any[]>
}

export interface AgentTeamsSectionProps {
  instances: TeamInstance[]
  onOpenTeams: () => void
}

export const STATUS_LABELS: Record<string, string> = {
  starting: '启动中',
  running: '运行中',
  idle: '空闲',
  waiting_input: '等待输入',
  completed: '已完成',
  error: '错误',
  terminated: '已结束',
}

export const ACTIVE_STATUSES = new Set(['starting', 'running', 'idle', 'waiting_input'])
