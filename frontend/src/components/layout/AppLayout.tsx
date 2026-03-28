/**
 * 应用主布局 - 三栏分栏布局（对齐 claudeops）
 */

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { ChevronLeft, ChevronRight, Users, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import Sidebar from './Sidebar'
import MainPanel from './MainPanel'
import RightPanel from './RightPanel'

import StatusBar from './StatusBar'
import SearchPanel from './SearchPanel'
import HistoryPanel from './HistoryPanel'
import PanelErrorBoundary from '../common/PanelErrorBoundary'
import ActivityBar from './ActivityBar'
import TitleBar from './TitleBar'
import { useUIStore } from '../../stores/uiStore'
import { usePanelStore } from '../../stores/panelStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useTeamStore } from '../../stores/teamStore'
import SettingsModal from '../settings/SettingsModal'
import SessionCreator from '../sessions/SessionCreator'
import QuickOpenDialog from '../file-manager/QuickOpenDialog'

export default function AppLayout() {
  const {
    showSearchPanel,
    showHistoryPanel,
    showQuickOpen,
    teamsMode,
    setTeamsMode,
    showSettings,
    setShowSettings,
    showNewSessionDialog,
    setShowNewSessionDialog,
  } = useUIStore(useShallow((state) => ({
    showSearchPanel: state.showSearchPanel,
    showHistoryPanel: state.showHistoryPanel,
    showQuickOpen: state.showQuickOpen,
    teamsMode: state.teamsMode,
    setTeamsMode: state.setTeamsMode,
    showSettings: state.showSettings,
    setShowSettings: state.setShowSettings,
    showNewSessionDialog: state.showNewSessionDialog,
    setShowNewSessionDialog: state.setShowNewSessionDialog,
  })))

  const {
    sidebarCollapsed,
    detailPanelCollapsed,
    toggleSidebar,
    toggleDetailPanel,
    activePanelLeft,
  } = usePanelStore(useShallow((state) => ({
    sidebarCollapsed: state.sidebarCollapsed,
    detailPanelCollapsed: state.detailPanelCollapsed,
    toggleSidebar: state.toggleSidebar,
    toggleDetailPanel: state.toggleDetailPanel,
    activePanelLeft: state.activePanelLeft,
  })))

  const { primaryPane, secondaryPane } = useLayoutStore(useShallow((state) => ({
    primaryPane: state.primaryPane,
    secondaryPane: state.secondaryPane,
  })))

  const mainPanelResetKey = `${primaryPane}:${secondaryPane}`

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <TitleBar />
      <div className="flex-1 overflow-hidden flex">
        <ActivityBar onOpenSettings={() => setShowSettings(true)} />

        {teamsMode ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 shrink-0">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-medium text-indigo-400">Agent Teams 模式</span>
              <div className="flex-1" />
              <button
                onClick={() => setTeamsMode(false)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                <X className="w-3 h-3" />
                返回普通模式
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-center h-full text-text-muted">Teams 模式</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden relative group">
            <Allotment>
              {!sidebarCollapsed && (
                <Allotment.Pane preferredSize={280} minSize={200} maxSize={400}>
                  <PanelErrorBoundary title="侧边栏" key={activePanelLeft}>
                    <Sidebar />
                  </PanelErrorBoundary>
                </Allotment.Pane>
              )}

              <Allotment.Pane>
                <div className="relative h-full pr-6">
                  <PanelErrorBoundary title="主内容区" key={mainPanelResetKey}>
                    <MainPanel />
                  </PanelErrorBoundary>

                  <button
                    onClick={toggleSidebar}
                    className="panel-toggle-btn left-0 rounded-r-md"
                    title={sidebarCollapsed ? '展开左侧面板' : '收起左侧面板'}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronLeft className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={toggleDetailPanel}
                    className="panel-toggle-btn right-0 rounded-l-md"
                    title={detailPanelCollapsed ? '展开活动时间线' : '收起活动时间线'}
                  >
                    {detailPanelCollapsed ? (
                      <ChevronLeft className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </Allotment.Pane>

              {!detailPanelCollapsed && (
                <Allotment.Pane preferredSize={300} minSize={220} maxSize={480}>
                  <div className="h-full border-l border-border bg-bg-secondary overflow-hidden">
                    <PanelErrorBoundary title="活动时间线">
                      <RightPanel />
                    </PanelErrorBoundary>
                  </div>
                </Allotment.Pane>
              )}
            </Allotment>
          </div>
        )}
      </div>

      <StatusBar />
      {showSearchPanel && <SearchPanel />}
      {showHistoryPanel && <HistoryPanel />}
      {showQuickOpen && <QuickOpenDialog />}
      {showNewSessionDialog && <SessionCreator onClose={() => setShowNewSessionDialog(false)} />}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
