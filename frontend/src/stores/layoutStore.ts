import { create } from 'zustand'

import type { LayoutMode, PaneContent } from './ui-helpers'
import {
  STORAGE_KEYS,
  isPaneContent,
  isLayoutMode,
  persistWorkspace,
  readStorage,
  writeStorage,
} from './ui-helpers'
import { useUIStore } from './uiStore'

export interface LayoutStateSnapshot {
  layoutMode: LayoutMode
  primaryPane: PaneContent
  secondaryPane: PaneContent
}

interface LayoutState extends LayoutStateSnapshot {
  setLayoutMode: (mode: LayoutMode) => void
  setPaneContent: (pane: 'primary' | 'secondary', content: PaneContent) => void
  swapPanes: () => void
}

export function createDefaultLayoutState(): LayoutStateSnapshot {
  const primaryPane = readStorage<PaneContent>(STORAGE_KEYS.primaryPane, 'sessions', isPaneContent)

  return {
    layoutMode: readStorage<LayoutMode>(STORAGE_KEYS.layoutMode, 'single', isLayoutMode),
    primaryPane,
    secondaryPane: readStorage<PaneContent>(STORAGE_KEYS.secondaryPane, 'files', isPaneContent),
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...createDefaultLayoutState(),

  setLayoutMode: (mode) => {
    writeStorage(STORAGE_KEYS.layoutMode, mode)
    set({ layoutMode: mode })
  },

  setPaneContent: (pane, content) => {
    if (pane === 'primary') {
      persistWorkspace(content, content)
      set({ primaryPane: content })
      useUIStore.setState({
        activeView: content,
        teamsMode: content === 'teams',
      })
      return
    }

    writeStorage(STORAGE_KEYS.secondaryPane, content)
    set({ secondaryPane: content })
  },

  swapPanes: () => {
    const { primaryPane, secondaryPane } = get()
    persistWorkspace(secondaryPane, secondaryPane)
    writeStorage(STORAGE_KEYS.secondaryPane, primaryPane)
    set({
      primaryPane: secondaryPane,
      secondaryPane: primaryPane,
    })
    useUIStore.setState({
      activeView: secondaryPane,
      teamsMode: secondaryPane === 'teams',
    })
  },
}))
