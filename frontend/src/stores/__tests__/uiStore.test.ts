import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultUIState, useUIStore } from '../uiStore'
import { createDefaultLayoutState, useLayoutStore } from '../layoutStore'
import { createDefaultPanelState, usePanelStore } from '../panelStore'

function resetAllStores() {
  window.localStorage.clear()
  useUIStore.setState(createDefaultUIState())
  useLayoutStore.setState(createDefaultLayoutState())
  usePanelStore.setState(createDefaultPanelState())
}

describe('uiStore panel system', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('includes explorer view and claudeops-style panels', () => {
    const panelState = createDefaultPanelState()
    const uiState = createDefaultUIState()
    expect(uiState.explorerView).toBe('tree')
    expect(panelState.panelSides).toHaveProperty('explorer')
    expect(panelState.panelSides).toHaveProperty('git')
  })

  it('syncs workspace state when a left panel becomes active', () => {
    usePanelStore.getState().setActivePanelLeft('workflows')

    const panelState = usePanelStore.getState()
    const uiState = useUIStore.getState()
    const layoutState = useLayoutStore.getState()
    expect(panelState.activePanelLeft).toBe('workflows')
    expect(uiState.activeView).toBe('workflows')
    expect(layoutState.primaryPane).toBe('workflows')
    expect(uiState.teamsMode).toBe(false)
  })

  it('enters teams mode when the workspace switches to teams', () => {
    useUIStore.getState().setActiveView('teams')

    const uiState = useUIStore.getState()
    const layoutState = useLayoutStore.getState()
    expect(uiState.activeView).toBe('teams')
    expect(layoutState.primaryPane).toBe('teams')
    expect(uiState.teamsMode).toBe(true)
  })

  it('moves panels between sides and expands the target panel region', () => {
    usePanelStore.setState({ detailPanelCollapsed: true })

    usePanelStore.getState().setPanelSide('dashboard', 'right')

    const panelState = usePanelStore.getState()
    expect(panelState.panelSides.dashboard).toBe('right')
    expect(panelState.activePanelRight).toBe('dashboard')
    expect(panelState.detailPanelCollapsed).toBe(false)
  })
})
