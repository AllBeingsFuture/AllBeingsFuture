/**
 * Activity Bar - 左侧功能图标条
 *
 * 面板系统：
 *   - 控制左侧边栏面板切换
 *   - 右侧详情面板（活动时间线）已移除
 */

import { Bot, Settings, Users } from 'lucide-react'
import { workbenchApi } from '../../app/api/workbench'
import type { PanelId } from '../../stores/ui-helpers'
import { usePanelStore } from '../../stores/panelStore'
import { useUIStore } from '../../stores/uiStore'

const PANEL_DEFS: {
  id: PanelId
  icon: React.ElementType
  label: string
  disabled?: boolean
}[] = [
  { id: 'sessions',  icon: Bot,        label: '会话管理' },
]

export default function ActivityBar() {
  const activePanelLeft = usePanelStore((state) => state.activePanelLeft)
  const teamsMode = useUIStore((state) => state.teamsMode)

  return (
    <div className="flex flex-col items-center w-12 shrink-0 h-full bg-bg-secondary border-r border-border py-2 z-10">
      <div className="flex flex-col items-center gap-1 w-full px-1">
        {PANEL_DEFS.map(({ id, icon: Icon, label, disabled }) => {
          const isActive = !teamsMode && activePanelLeft === id
          return (
            <button
              key={id}
              title={disabled ? `${label}（即将推出）` : label}
              disabled={disabled}
              onClick={() => {
                if (disabled) return
                void workbenchApi.ui.setTeamsMode(false)
                void workbenchApi.panel.show(id, 'left')
              }}
              className={[
                'relative w-full h-10 flex items-center justify-center rounded-lg transition-all duration-200 select-none',
                isActive
                  ? 'text-accent-blue bg-accent-blue/10'
                  : disabled
                  ? 'text-text-muted opacity-30 cursor-not-allowed'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.06] cursor-pointer',
              ].join(' ')}
            >
              {isActive && (
                <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent-blue shadow-[0_0_6px_rgba(88,166,255,0.4)]" />
              )}
              <Icon className="w-[18px] h-[18px]" />
            </button>
          )
        })}
      </div>

      <div className="flex-1" />

      {/* Teams 按钮 */}
      <div className="px-1 w-full mb-0.5">
        <button
          title="Agent Teams — 多 AI 协作"
          onClick={() => { void workbenchApi.ui.setTeamsMode(!teamsMode) }}
          className={[
            'relative w-full h-10 flex items-center justify-center rounded-lg transition-all duration-200',
            teamsMode
              ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
              : 'text-text-muted hover:text-indigo-400 hover:bg-indigo-500/10',
          ].join(' ')}
        >
          {teamsMode && (
            <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] bg-indigo-400 rounded-full shadow-[0_0_6px_rgba(129,140,248,0.4)]" />
          )}
          <Users className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="w-5 border-t border-white/[0.06] mb-1" />

      {/* 设置按钮 */}
      <div className="px-1 w-full">
        <button
          title="设置"
          onClick={() => { void workbenchApi.ui.setSettingsVisible(true) }}
          className="w-full h-10 flex items-center justify-center rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.06] transition-all duration-200 cursor-pointer"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  )
}
