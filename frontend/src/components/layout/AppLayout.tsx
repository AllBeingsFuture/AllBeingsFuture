/**
 * 应用主布局 - 三栏分栏布局（对齐 claudeops）
 */

import { Suspense, lazy } from 'react'
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
import QuickOpenDialog from '../file-manager/QuickOpenDialog'
import { workbenchApi } from '../../app/api/workbench'

const SettingsModal = lazy(() => import('../settings/SettingsModal'))
const SessionCreator = lazy(() => import('../sessions/SessionCreator'))

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
        <ActivityBar />

        {teamsMode ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 shrink-0">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-medium text-indigo-400">Agent Teams 模式</span>
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
                <div className="relative h-full pr-6">
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

                  <button
                    onClick={() => { void workbenchApi.panel.toggleDetail() }}
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
      {showNewSessionDialog && (
        <Suspense fallback={<DialogFallback title="新建会话" description="正在准备会话配置..." compact />}>
          <SessionCreator onClose={() => { void workbenchApi.ui.setNewSessionDialogVisible(false) }} />
        </Suspense>
      )}

      {showSettings && (
        <Suspense fallback={<DialogFallback title="设置" description="正在加载设置内容..." wide />}>
          <SettingsModal onClose={() => { void workbenchApi.ui.setSettingsVisible(false) }} />
        </Suspense>
      )}
    </div>
  )
}

function DialogFallback({
  title,
  description,
  compact = false,
  wide = false,
}: {
  title: string
  description: string
  compact?: boolean
  wide?: boolean
}) {
  const widthClass = compact ? 'max-w-[560px]' : wide ? 'max-w-5xl' : 'max-w-3xl'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45">
      <div
        aria-live="polite"
        className={[
          'w-[calc(100vw-32px)] rounded-2xl border border-white/[0.08] bg-[#0d1117]/96 px-6 py-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]',
          widthClass,
        ].join(' ')}
      >
        <div className="h-4 w-24 rounded-full bg-white/[0.08]" />
        <div className="mt-4 flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl border border-white/[0.08] bg-blue-500/10" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded-full bg-white/[0.12]" />
            <div className="h-3 w-48 rounded-full bg-white/[0.06]" />
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-400">{title} {description}</p>
      </div>
    </div>
  )
}
