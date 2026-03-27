import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultLayoutState, useLayoutStore } from '../layoutStore'
import { createDefaultPanelState, usePanelStore } from '../panelStore'
import { createDefaultUIState, useUIStore } from '../uiStore'

function resetAllStores() {
  window.localStorage.clear()
  useUIStore.setState(createDefaultUIState())
  useLayoutStore.setState(createDefaultLayoutState())
  usePanelStore.setState(createDefaultPanelState())
}

describe('layoutStore', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('has correct initial state', () => {
    const state = useLayoutStore.getState()
    expect(state.layoutMode).toBe('single')
    expect(state.primaryPane).toBe('sessions')
    expect(state.secondaryPane).toBe('files')
  })

  it('setLayoutMode updates layoutMode', () => {
    useLayoutStore.getState().setLayoutMode('split-h')
    expect(useLayoutStore.getState().layoutMode).toBe('split-h')
  })

  it('setPaneContent("primary", ...) updates primaryPane', () => {
    useLayoutStore.getState().setPaneContent('primary', 'kanban')
    expect(useLayoutStore.getState().primaryPane).toBe('kanban')
  })

  it('setPaneContent("secondary", ...) updates secondaryPane', () => {
    useLayoutStore.getState().setPaneContent('secondary', 'worktree')
    expect(useLayoutStore.getState().secondaryPane).toBe('worktree')
  })

  it('swapPanes exchanges primary and secondary', () => {
    useLayoutStore.getState().setPaneContent('primary', 'dashboard')
    useLayoutStore.getState().setPaneContent('secondary', 'kanban')

    useLayoutStore.getState().swapPanes()

    const state = useLayoutStore.getState()
    expect(state.primaryPane).toBe('kanban')
    expect(state.secondaryPane).toBe('dashboard')
  })
})
