import { create } from 'zustand'
import { SuggestionService } from '../../bindings/allbeingsfuture/internal/services'

export interface Suggestion {
  id: string
  type: string
  content: string
  sessionId: string
  timestamp: string
}

interface SuggestionState {
  activeSuggestion: Suggestion | null
  poll: () => Promise<void>
  dismiss: (id: string) => Promise<void>
}

export const useSuggestionStore = create<SuggestionState>((set) => ({
  activeSuggestion: null,
  poll: async () => {
    const suggestion = await SuggestionService.GetActiveSuggestion()
    set({ activeSuggestion: suggestion ?? null })
  },
  dismiss: async (id) => {
    await SuggestionService.Dismiss(id)
    set({ activeSuggestion: null })
  },
}))
