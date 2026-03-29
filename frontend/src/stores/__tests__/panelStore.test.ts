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
    expect(state.panelRuntime.sidebar).toBe('inactive')
    expect(state.panelRuntime.detail).toBe('inactive')
    expect(state.panelRuntime.shell).toBe('frozen')
    expect(state.sidebarWidth).toBe(280)
    expect(state.detailPanelWidth).toBe(320)
    expect(state.floatingPanels).toEqual({})
  })

  it('toggleSidebar toggles sidebarCollapsed', () => {
    expect(usePanelStore.getState().sidebarCollapsed).toBe(false)
    usePanelStore.getState().toggleSidebar()
    expect(usePanelStore.getState().sidebarCollapsed).toBe(true)
    expect(usePanelStore.getState().panelRuntime.sidebar).toBe('frozen')
    usePanelStore.getState().toggleSidebar()
    expect(usePanelStore.getState().sidebarCollapsed).toBe(false)
    expect(usePanelStore.getState().panelRuntime.sidebar).toBe('active')
  })

  it('toggleDetailPanel toggles detailPanelCollapsed', () => {
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(false)
    usePanelStore.getState().toggleDetailPanel()
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(true)
    expect(usePanelStore.getState().panelRuntime.detail).toBe('frozen')
    usePanelStore.getState().toggleDetailPanel()
    expect(usePanelStore.getState().detailPanelCollapsed).toBe(false)
    expect(usePanelStore.getState().panelRuntime.detail).toBe('active')
  })

  it('setActivePanelLeft updates activePanelLeft', () => {
    usePanelStore.getState().setActivePanelLeft('explorer')
    expect(usePanelStore.getState().activePanelLeft).toBe('explorer')
    expect(usePanelStore.getState().panelRuntime.sidebar).toBe('active')
  })

  it('setActivePanelRight updates activePanelRight', () => {
    usePanelStore.getState().setActivePanelRight('stats')
    expect(usePanelStore.getState().activePanelRight).toBe('stats')
    expect(usePanelStore.getState().panelRuntime.detail).toBe('active')
  })

  it('setShellPanelVisible updates shell runtime state', () => {
    usePanelStore.getState().setShellPanelVisible(true)
    expect(usePanelStore.getState().shellPanelVisible).toBe(true)
    expect(usePanelStore.getState().panelRuntime.shell).toBe('active')

    usePanelStore.getState().setShellPanelVisible(false)
    expect(usePanelStore.getState().shellPanelVisible).toBe(false)
    expect(usePanelStore.getState().panelRuntime.shell).toBe('frozen')
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
