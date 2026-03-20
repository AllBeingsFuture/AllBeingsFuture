import {
  Target,
  Brain,
  Users,
  ListChecks,
  Rocket,
  Pause,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

export type MissionStatus =
  | 'planning'
  | 'brainstorming'
  | 'team_design'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'

export const statusColors: Record<MissionStatus, string> = {
  planning: 'text-gray-400',
  brainstorming: 'text-blue-400',
  team_design: 'text-purple-400',
  ready: 'text-yellow-400',
  running: 'text-green-400',
  paused: 'text-orange-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
}

export const statusBg: Record<MissionStatus, string> = {
  planning: 'bg-gray-600',
  brainstorming: 'bg-blue-600',
  team_design: 'bg-purple-600',
  ready: 'bg-yellow-600',
  running: 'bg-green-600',
  paused: 'bg-orange-600',
  completed: 'bg-emerald-600',
  failed: 'bg-red-600',
}

export const statusLabels: Record<MissionStatus, string> = {
  planning: '规划中',
  brainstorming: '头脑风暴',
  team_design: '团队设计',
  ready: '就绪',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

export const phaseIcons: Record<string, typeof Target> = {
  planning: Target,
  brainstorming: Brain,
  team_design: Users,
  ready: ListChecks,
  running: Rocket,
  paused: Pause,
  completed: CheckCircle2,
  failed: AlertTriangle,
}
