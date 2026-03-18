/**
 * 布局控制按钮组
 * 单窗格 / 左右分栏 / 上下分栏 切换
 */

import { Columns2, Rows3, Square } from 'lucide-react'
import { type LayoutMode, useUIStore } from '../../stores/uiStore'

const layouts: Array<{ mode: LayoutMode; icon: typeof Square; label: string }> = [
  { mode: 'single', icon: Square, label: '单窗格' },
  { mode: 'split-h', icon: Columns2, label: '左右分栏' },
  { mode: 'split-v', icon: Rows3, label: '上下分栏' },
]

export default function LayoutControls() {
  const layoutMode = useUIStore((state) => state.layoutMode)
  const setLayoutMode = useUIStore((state) => state.setLayoutMode)

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5 mr-1">
      {layouts.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setLayoutMode(mode)}
          title={label}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all duration-200 ${
            layoutMode === mode
              ? 'bg-blue-500/15 text-blue-300 shadow-sm'
              : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
          }`}
        >
          <Icon size={12} />
          <span className="hidden md:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
