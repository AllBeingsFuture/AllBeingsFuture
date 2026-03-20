import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultUIState, useUIStore } from '../uiStore'

function resetUIStore() {
  window.localStorage.clear()
  useUIStore.setState(createDefaultUIState())
}

describe('uiStore panel system', () => {
  beforeEach(() => {
    resetUIStore()
  })

  it('includes explorer view and claudeops-style panels', () => {
    const state = createDefaultUIState()
    expect(state.explorerView).toBe('tree')
    expect(state.panelSides).toHaveProperty('explorer')
    expect(state.panelSides).toHaveProperty('git')
  })

  it('syncs workspace state when a left panel becomes active', () => {
    useUIStore.getState().setActivePanelLeft('workflows')

    const state = useUIStore.getState()
    expect(state.activePanelLeft).toBe('workflows')
    expect(state.activeView).toBe('workflows')
    expect(state.primaryPane).toBe('workflows')
    expect(state.teamsMode).toBe(false)
  })

  it('enters teams mode when the workspace switches to teams', () => {
    useUIStore.getState().setActiveView('teams')

    const state = useUIStore.getState()
    expect(state.activeView).toBe('teams')
    expect(state.primaryPane).toBe('teams')
    expect(state.teamsMode).toBe(true)
  })

  it('moves panels between sides and expands the target panel region', () => {
    useUIStore.setState({ detailPanelCollapsed: true })

    useUIStore.getState().setPanelSide('dashboard', 'right')

    const state = useUIStore.getState()
    expect(state.panelSides.dashboard).toBe('right')
    expect(state.activePanelRight).toBe('dashboard')
    expect(state.detailPanelCollapsed).toBe(false)
  })
})
