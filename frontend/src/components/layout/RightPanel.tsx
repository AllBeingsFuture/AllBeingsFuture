/**
 * 右侧面板 - 根据 activePanelRight 渲染对应内容
 * 默认显示活动时间线（TimelinePanel）
 */

import { usePanelStore } from '../../stores/panelStore'
import TimelinePanel from '../panels/TimelinePanel'
import StatsPanel from '../panels/StatsPanel'
import SessionsContent from './SessionsContent'
import FileManagerPanel from '../files/FileManagerPanel'
import WorktreePanel from '../git/WorktreePanel'
import ToolsCatalogPanel from '../tools/ToolsCatalogPanel'

export default function RightPanel() {
  const activePanelRight = usePanelStore(s => s.activePanelRight)

  switch (activePanelRight) {
    case 'timeline':
      return <TimelinePanel />
    case 'stats':
      return <StatsPanel />
    case 'sessions':
      return <SessionsContent />
    case 'explorer':
      return <FileManagerPanel />
    case 'git':
      return <WorktreePanel />
    case 'tools':
      return <ToolsCatalogPanel />
    default:
      return <TimelinePanel />
  }
}
