import { create } from 'zustand'
import { UpdateService } from '../../bindings/allbeingsfuture/internal/services'

interface UpdateState {
  state: any | null
  checkForUpdates: (manual?: boolean) => Promise<void>
  openDownloadPage: () => Promise<string>
}

export const useUpdateStore = create<UpdateState>((set) => ({
  state: null,
  checkForUpdates: async (manual = false) => {
    const state = await UpdateService.CheckForUpdates(manual)
    set({ state })
  },
  openDownloadPage: async () => {
    return await UpdateService.OpenDownloadPage()
  },
}))
