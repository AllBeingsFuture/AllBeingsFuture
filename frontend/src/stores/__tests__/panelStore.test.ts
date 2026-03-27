import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultPanelState, usePanelStore } from '../panelStore'
import { createDefaultLayoutState, useLayoutStore } from '../layoutStore'
import { createDefaultUIState, useUIStore } from '../uiStore'

function resetAllStores() {
  window.localStorage.clear()
  useUIStore.setState(createDefaultUIState())
  useLayoutStore.setState(createDefaultLayoutState())
  usePanelStore.setState(createDefaultPanelState())
}

describe('panelStore', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('has correct initial state', () => {
    const state = usePanelStore.getState()
    expect(state.sidebarCollapsed).toBe(false)
    expect(state.detailPanelCollapsed).toBe(false)
    expect(state.sidebarWidth).toBe(280)
    expect(state.detailPanelWidth).toBe(320)
    expect(state.floatingPanels).toEqual({})
  })

  it('toggleSidebar toggles sidebarCollapsed', () => {
    expect(usePanelStore.getState().sidebarCollapsed).toBe(false)
    usePanelStore.getState().toggleSidebar()
    expect(usePanelStore.getState().sidebarCollapsed).toBe(true)
    usePanelStore.getState().toggleSidebar()
    expect(usePanelStore.getState().sidebarCollapsed).toBe(false)
  })

  it('toggleDetailPanel toggles detailPanelCollapsed', () => {
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(false)
    usePanelStore.getState().toggleDetailPanel()
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(true)
    usePanelStore.getState().toggleDetailPanel()
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(false)
  })

  it('setActivePanelLeft updates activePanelLeft', () => {
    usePanelStore.getState().setActivePanelLeft('explorer')
    expect(usePanelStore.getState().activePanelLeft).toBe('explorer')
  })

  it('setActivePanelRight updates activePanelRight', () => {
    usePanelStore.getState().setActivePanelRight('stats')
    expect(usePanelStore.getState().activePanelRight).toBe('stats')
  })

  it('setSidebarWidth updates sidebarWidth', () => {
    usePanelStore.getState().setSidebarWidth(400)
    expect(usePanelStore.getState().sidebarWidth).toBe(400)
  })

  it('setDetailPanelWidth updates detailPanelWidth', () => {
    usePanelStore.getState().setDetailPanelWidth(500)
    expect(usePanelStore.getState().detailPanelWidth).toBe(500)
  })

  it('toggleFloatingPanel toggles a floating panel on and off', () => {
    usePanelStore.getState().toggleFloatingPanel('test-panel')
    expect(usePanelStore.getState().floatingPanels['test-panel']).toBe(true)

    usePanelStore.getState().toggleFloatingPanel('test-panel')
    expect(usePanelStore.getState().floatingPanels['test-panel']).toBe(false)
  })

  it('closeFloatingPanel sets a floating panel to false', () => {
    usePanelStore.getState().toggleFloatingPanel('test-panel')
    expect(usePanelStore.getState().floatingPanels['test-panel']).toBe(true)

    usePanelStore.getState().closeFloatingPanel('test-panel')
    expect(usePanelStore.getState().floatingPanels['test-panel']).toBe(false)
  })
})
