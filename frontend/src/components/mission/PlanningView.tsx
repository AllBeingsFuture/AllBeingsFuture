import { Loader2 } from 'lucide-react'

export default function PlanningView({ mission }: { mission: any }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Loader2 size={32} className="mx-auto mb-3 text-blue-400 animate-spin" />
        <p className="text-sm text-gray-300">AI 正在分析任务目标...</p>
        <p className="text-xs text-gray-500 mt-1">即将生成头脑风暴方案</p>
        {mission.objective && (
          <div className="mt-4 px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-left max-w-md">
            <div className="text-xs text-gray-500 mb-1">任务目标</div>
            <p className="text-sm text-gray-300">{mission.objective}</p>
          </div>
        )}
      </div>
    </div>
  )
}
