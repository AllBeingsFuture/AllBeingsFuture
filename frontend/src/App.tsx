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
  const settings = useSettingsStore((state) => state.settings)
  const settingsLoaded = useSettingsStore((state) => state.loaded)

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

    applyTheme(settings.theme || 'dark')
    document.documentElement.style.fontSize = `${settings.fontSize || 14}px`
  }, [settingsLoaded, settings.theme, settings.fontSize])

  return (
    <RootErrorBoundary>
      <AppLayout />
    </RootErrorBoundary>
  )
}
