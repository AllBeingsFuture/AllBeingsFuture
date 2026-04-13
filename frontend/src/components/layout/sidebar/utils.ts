import type { Session } from '../../../../bindings/allbeingsfuture/internal/models/models'
import type { DirectoryGroup, TimeGroup } from './types'
import { ACTIVE_STATUSES } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function getSessionTimestamp(session: Session) {
  const raw = session.endedAt || session.startedAt
  return raw ? new Date(raw as any).getTime() : 0
}

export function getShortPath(fullPath: string) {
  const normalized = (fullPath || '').replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 2) {
    return normalized || '未设置目录'
  }
  return parts.slice(-2).join('/')
}

export function formatSessionTime(session: Session) {
  const timestamp = getSessionTimestamp(session)
  if (!timestamp) return '未记录时间'

  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function matchesSessionQuery(session: Session, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [
    session.name,
    session.providerId,
    session.workingDirectory,
    session.status,
    session.mode,
    session.worktreeBranch,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized))
}

export function sortSessionsInGroup(sessions: Session[]) {
  sessions.sort((left, right) => {
    const leftActive = ACTIVE_STATUSES.has(left.status) ? 1 : 0
    const rightActive = ACTIVE_STATUSES.has(right.status) ? 1 : 0

    if (leftActive !== rightActive) {
      return rightActive - leftActive
    }

    return getSessionTimestamp(right) - getSessionTimestamp(left)
  })
}

export function groupSessionsByTime(sessions: Session[]): TimeGroup[] {
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const weekStart = todayStart - DAY_MS * 7

  const live: Session[] = []
  const today: Session[] = []
  const thisWeek: Session[] = []
  const older: Session[] = []

  sessions.forEach((session) => {
    const timestamp = getSessionTimestamp(session)

    if (ACTIVE_STATUSES.has(session.status)) {
      live.push(session)
      return
    }

    if (timestamp >= todayStart && timestamp <= now) {
      today.push(session)
      return
    }

    if (timestamp >= weekStart) {
      thisWeek.push(session)
      return
    }

    older.push(session)
  })

  ;[live, today, thisWeek, older].forEach(sortSessionsInGroup)

  return [
    { key: 'live', title: '运行中', sessions: live },
    { key: 'today', title: '今天', sessions: today },
    { key: 'week', title: '过去 7 天', sessions: thisWeek },
    { key: 'older', title: '更早', sessions: older },
  ].filter((group) => group.sessions.length > 0)
}

export function groupSessionsByDirectory(sessions: Session[]): DirectoryGroup[] {
  const groups = new Map<string, DirectoryGroup>()

  sessions.forEach((session) => {
    const key = session.workingDirectory || '__unknown__'
    const existing = groups.get(key)

    if (existing) {
      existing.sessions.push(session)
      return
    }

    groups.set(key, {
      key,
      title: getShortPath(session.workingDirectory),
      subtitle: session.workingDirectory || '未设置目录',
      sessions: [session],
    })
  })

  const result = Array.from(groups.values())
  result.forEach((group) => sortSessionsInGroup(group.sessions))
  result.sort((left, right) => {
    const leftTop = left.sessions[0]
    const rightTop = right.sessions[0]
    return getSessionTimestamp(rightTop) - getSessionTimestamp(leftTop)
  })

  return result
}
