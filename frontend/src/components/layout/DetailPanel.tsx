/**
 * 右侧详情面板 - 根据 activePanelRight 渲染对应面板
 */

import { usePanelStore } from '../../stores/panelStore'
import TimelinePanel from '../panels/TimelinePanel'
import StatsPanel from '../panels/StatsPanel'
import SessionsContent from './SessionsContent'
import DashboardSidebarView from '../sidebar/DashboardSidebarView'
import FileManagerPanel from '../files/FileManagerPanel'
import WorktreePanel from '../git/WorktreePanel'

export default function DetailPanel() {
  const activePanelRight = usePanelStore(s => s.activePanelRight)

  const renderContent = () => {
    switch (activePanelRight) {
      case 'timeline':  return <TimelinePanel />
      case 'stats':     return <StatsPanel />
      case 'sessions':  return <SessionsContent />
      case 'dashboard': return <DashboardSidebarView />
      case 'explorer':  return <FileManagerPanel />
      case 'git':       return <WorktreePanel />
      default:          return <TimelinePanel />
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary border-l border-border">
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}
