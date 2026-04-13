import { useEffect } from 'react'
import AppLayout from './components/layout/AppLayout'
import RootErrorBoundary from './components/common/RootErrorBoundary'
import { applyTheme } from './constants/themes'
import { useMissionStore } from './stores/missionStore'
import { useSessionStore } from './stores/sessionStore'
import { useSettingsStore } from './stores/settingsStore'
import { useTaskStore } from './stores/taskStore'
import { useTeamStore } from './stores/teamStore'
import { useWorkflowStore } from './stores/workflowStore'

export default function App() {
  const loadDefinitions = useTeamStore((state) => state.loadDefinitions)
  const loadInstances = useTeamStore((state) => state.loadInstances)
  const loadSessions = useSessionStore((state) => state.load)
  const loadSettings = useSettingsStore((state) => state.load)
  const loadTasks = useTaskStore((state) => state.load)
  const loadWorkflows = useWorkflowStore((state) => state.load)
  const loadMissions = useMissionStore((state) => state.load)
  const settingsLoaded = useSettingsStore((state) => state.loaded)
  const activeTheme = useSettingsStore((state) => state.settings.theme)
  const activeFontSize = useSettingsStore((state) => state.settings.fontSize)

  useEffect(() => {
    loadDefinitions()
    loadInstances()
    loadSessions()
    loadSettings()
    loadTasks()
    loadWorkflows()
    loadMissions()
  }, [loadDefinitions, loadInstances, loadSessions, loadSettings, loadTasks, loadWorkflows, loadMissions])

  useEffect(() => {
    if (!settingsLoaded) return

    applyTheme(activeTheme || 'dark')
    document.documentElement.style.fontSize = `${activeFontSize || 14}px`
  }, [activeFontSize, activeTheme, settingsLoaded])

  return (
    <RootErrorBoundary>
      <AppLayout />
    </RootErrorBoundary>
  )
}
