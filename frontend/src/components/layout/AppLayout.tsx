/**
 * 应用主布局 - 左侧边栏 + 主内容区
 */

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { ChevronLeft, ChevronRight, Users, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import Sidebar from './Sidebar'
import MainPanel from './MainPanel'

import StatusBar from './StatusBar'
import SearchPanel from './SearchPanel'
import HistoryPanel from './HistoryPanel'
import PanelErrorBoundary from '../common/PanelErrorBoundary'
import ActivityBar from './ActivityBar'
import TitleBar from './TitleBar'
import { useUIStore } from '../../stores/uiStore'
import { usePanelStore } from '../../stores/panelStore'
import { useLayoutStore } from '../../stores/layoutStore'
import SettingsModal from '../settings/SettingsModal'
import SessionCreator from '../sessions/SessionCreator'
import QuickOpenDialog from '../file-manager/QuickOpenDialog'
import { workbenchApi } from '../../app/api/workbench'

export default function AppLayout() {
  const {
    showSearchPanel,
    showHistoryPanel,
    showQuickOpen,
    teamsMode,
    showSettings,
    showNewSessionDialog,
  } = useUIStore(useShallow((state) => ({
    showSearchPanel: state.showSearchPanel,
    showHistoryPanel: state.showHistoryPanel,
    showQuickOpen: state.showQuickOpen,
    teamsMode: state.teamsMode,
    showSettings: state.showSettings,
    showNewSessionDialog: state.showNewSessionDialog,
  })))

  const {
    sidebarCollapsed,
    activePanelLeft,
  } = usePanelStore(useShallow((state) => ({
    sidebarCollapsed: state.sidebarCollapsed,
    activePanelLeft: state.activePanelLeft,
  })))

  const { primaryPane, secondaryPane } = useLayoutStore(useShallow((state) => ({
    primaryPane: state.primaryPane,
    secondaryPane: state.secondaryPane,
  })))

  const mainPanelResetKey = `${primaryPane}:${secondaryPane}`

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary">
      <TitleBar />
      <div className="flex-1 overflow-hidden flex">
        <ActivityBar />

        {teamsMode ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/[0.12] border-b border-indigo-500/25 shrink-0">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-medium tracking-wide text-indigo-300">Agent Teams 模式</span>
              <div className="flex-1" />
              <button
                onClick={() => { void workbenchApi.ui.setTeamsMode(false) }}
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
                <div className="relative h-full pl-6">
                  <PanelErrorBoundary title="主内容区" key={mainPanelResetKey}>
                    <MainPanel />
                  </PanelErrorBoundary>

                  <button
                    onClick={() => { void workbenchApi.panel.toggleSidebar() }}
                    className="panel-toggle-btn left-0 rounded-r-md"
                    title={sidebarCollapsed ? '展开左侧面板' : '收起左侧面板'}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronLeft className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        )}
      </div>

      <StatusBar />
      {showSearchPanel && <SearchPanel />}
      {showHistoryPanel && <HistoryPanel />}
      {showQuickOpen && <QuickOpenDialog />}
      {showNewSessionDialog && <SessionCreator onClose={() => { void workbenchApi.ui.setNewSessionDialogVisible(false) }} />}

      {showSettings && (
        <SettingsModal onClose={() => { void workbenchApi.ui.setSettingsVisible(false) }} />
      )}
    </div>
  )
}
