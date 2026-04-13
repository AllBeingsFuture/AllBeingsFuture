import { create } from 'zustand'
import { TrackerService } from '../../bindings/allbeingsfuture/internal/services'

interface TrackerState {
  sessionChanges: Record<string, any[]>
  loadSessionChanges: (sessionId: string) => Promise<void>
}

export const useTrackerStore = create<TrackerState>((set) => ({
  sessionChanges: {},
  loadSessionChanges: async (sessionId) => {
    const changes = await TrackerService.GetSessionChanges(sessionId)
    set(s => ({
      sessionChanges: { ...s.sessionChanges, [sessionId]: changes ?? [] },
    }))
  },
}))
