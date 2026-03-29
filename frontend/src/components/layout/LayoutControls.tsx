/**
 * 中间区域布局切换按钮组
 * 支持单窗格 / 左右分栏 / 上下分栏，分栏模式下可交换窗格内容
 */

import { Square, PanelsLeftRight, PanelsTopBottom, ArrowLeftRight, ArrowUpDown } from 'lucide-react'
import { workbenchApi } from '../../app/api/workbench'
import type { LayoutMode } from '../../stores/ui-helpers'
import { useLayoutStore } from '../../stores/layoutStore'

export default function LayoutControls() {
  const layoutMode = useLayoutStore((state) => state.layoutMode)

  const buttons: Array<{ mode: LayoutMode; icon: React.ElementType; title: string }> = [
    { mode: 'single',  icon: Square,           title: '单窗格' },
    { mode: 'split-h', icon: PanelsLeftRight,   title: '左右分栏' },
    { mode: 'split-v', icon: PanelsTopBottom,   title: '上下分栏' },
  ]

  const isSplit = layoutMode !== 'single'
  const SwapIcon = layoutMode === 'split-v' ? ArrowUpDown : ArrowLeftRight

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5 mr-1">
      {isSplit && (
        <button
          onClick={() => { void workbenchApi.layout.swapPanes() }}
          title={layoutMode === 'split-v' ? '交换上下内容' : '交换左右内容'}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all duration-200 text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
        >
          <SwapIcon size={12} />
        </button>
      )}
      {buttons.map(({ mode, icon: Icon, title }) => (
        <button
          key={mode}
          onClick={() => { void workbenchApi.layout.setMode(mode) }}
          title={title}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all duration-200 ${
            layoutMode === mode
              ? 'bg-blue-500/15 text-blue-300 shadow-sm'
              : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
          }`}
        >
          <Icon size={12} />
          <span className="hidden md:inline">{title}</span>
        </button>
      ))}
    </div>
  )
}
