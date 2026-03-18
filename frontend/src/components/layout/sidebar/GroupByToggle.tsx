import { Clock3, FolderTree } from 'lucide-react'
import type { SidebarGroupMode } from './types'

interface GroupByToggleProps {
  value: SidebarGroupMode
  onChange: (mode: SidebarGroupMode) => void
}

const options: Array<{ value: SidebarGroupMode; label: string; icon: typeof Clock3 }> = [
  { value: 'time', label: '按时间', icon: Clock3 },
  { value: 'directory', label: '按目录', icon: FolderTree },
]

export default function GroupByToggle({ value, onChange }: GroupByToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5 gap-0.5">
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
              active
                ? 'bg-white/[0.1] text-gray-200 shadow-sm border border-white/[0.06]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent',
            ].join(' ')}
          >
            <Icon size={12} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
