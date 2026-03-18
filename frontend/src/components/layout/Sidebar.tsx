/**
 * 左侧边栏 - 根据 activePanelLeft 渲染对应面板内容
 */

import { useUIStore } from '../../stores/uiStore'
import FileManagerPanel from '../files/FileManagerPanel'
import WorktreePanel from '../git/WorktreePanel'
import DashboardSidebarView from '../sidebar/DashboardSidebarView'
import TutorialSidebarView from '../sidebar/TutorialSidebarView'
import TimelinePanel from '../panels/TimelinePanel'
import StatsPanel from '../panels/StatsPanel'
import SessionsContent from './SessionsContent'
import ToolsCatalogPanel from '../tools/ToolsCatalogPanel'

export default function Sidebar() {
  const activePanelLeft = useUIStore(s => s.activePanelLeft)

  switch (activePanelLeft) {
    case 'dashboard':
      return <DashboardSidebarView />
    case 'explorer':
      return <FileManagerPanel />
    case 'git':
      return <WorktreePanel />
    case 'tools':
      return <ToolsCatalogPanel />
    case 'timeline':
      return <TimelinePanel />
    case 'stats':
      return <StatsPanel />
    case 'mcp':
      return <ComingSoon label="MCP 工具" />
    case 'skills':
      return <ComingSoon label="技能库" />
    case 'tutorial':
      return <TutorialSidebarView />
    case 'sessions':
      return <SessionsContent />
    default:
      return <ComingSoon label={activePanelLeft} />
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-text-muted">即将推出</p>
      </div>
    </div>
  )
}
