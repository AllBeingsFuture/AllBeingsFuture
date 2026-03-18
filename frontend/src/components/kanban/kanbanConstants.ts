import { AlertCircle, Clock, CheckCircle2, Pause } from 'lucide-react'

export const COLUMNS = [
  { id: 'todo', label: '待办', color: 'blue', icon: AlertCircle },
  { id: 'in_progress', label: '进行中', color: 'yellow', icon: Clock },
  { id: 'waiting', label: '等待中', color: 'purple', icon: Pause },
  { id: 'done', label: '已完成', color: 'green', icon: CheckCircle2 },
] as const

export type ColumnId = (typeof COLUMNS)[number]['id']

export const PRIORITIES = [
  { value: 1, label: '紧急', color: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/30' },
  { value: 2, label: '高', color: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30' },
  { value: 3, label: '中', color: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  { value: 4, label: '低', color: 'bg-gray-500', text: 'text-gray-400', border: 'border-gray-500/30' },
] as const

export const COLUMN_STYLES: Record<string, { header: string; accent: string; badge: string; dot: string }> = {
  blue: {
    header: 'text-blue-400',
    accent: 'border-blue-500/40',
    badge: 'bg-blue-500/20 text-blue-300',
    dot: 'bg-blue-400',
  },
  yellow: {
    header: 'text-yellow-400',
    accent: 'border-yellow-500/40',
    badge: 'bg-yellow-500/20 text-yellow-300',
    dot: 'bg-yellow-400',
  },
  purple: {
    header: 'text-purple-400',
    accent: 'border-purple-500/40',
    badge: 'bg-purple-500/20 text-purple-300',
    dot: 'bg-purple-400',
  },
  green: {
    header: 'text-green-400',
    accent: 'border-green-500/40',
    badge: 'bg-green-500/20 text-green-300',
    dot: 'bg-green-400',
  },
}

export function truncate(text: string | undefined | null, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

export function getPriority(value: number) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[3]
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
