export const statusColors: Record<string, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  waiting_approval: 'text-orange-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
}

export const statusLabels: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  waiting_approval: '待审批',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export const stepTypeLabels: Record<string, string> = {
  session: '会话步骤',
  manual: '人工审批',
  wait: '等待步骤',
}

export const stepTypeBadgeColors: Record<string, string> = {
  session: 'bg-blue-600',
  manual: 'bg-orange-600',
  wait: 'bg-gray-600',
}

export const DEFAULT_DEFINITION = JSON.stringify(
  {
    steps: [
      {
        id: 'step1',
        name: '示例步骤',
        type: 'session',
        sessionConfig: {},
        dependsOn: [],
      },
    ],
  },
  null,
  2,
)
