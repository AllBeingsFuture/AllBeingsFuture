import SessionPanel from '../sessions/SessionPanel'
import DashboardSidebarView from '../sidebar/DashboardSidebarView'
import FileManagerPanel from '../files/FileManagerPanel'
import WorktreePanel from '../git/WorktreePanel'
import KanbanBoard from '../kanban/KanbanBoard'
import WorkflowPanel from '../workflow/WorkflowPanel'
import MissionPanel from '../mission/MissionPanel'
import TeamPanel from '../teams/TeamPanel'
import { useLayoutStore } from '../../stores/layoutStore'

function renderContent(primaryPane: ReturnType<typeof useLayoutStore.getState>['primaryPane']) {
  switch (primaryPane) {
    case 'dashboard':
      return <DashboardSidebarView />
    case 'files':
      return <FileManagerPanel />
    case 'worktree':
      return <WorktreePanel />
    case 'kanban':
      return <KanbanBoard />
    case 'workflows':
      return <WorkflowPanel />
    case 'missions':
      return <MissionPanel />
    case 'teams':
      return <TeamPanel />
    case 'sessions':
    default:
      return <SessionPanel />
  }
}

export default function MainPanel() {
  const primaryPane = useLayoutStore((state) => state.primaryPane)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1117]/95 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      {renderContent(primaryPane)}
    </section>
  )
}
