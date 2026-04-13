import { create } from 'zustand'
import { AuthService } from '../../bindings/allbeingsfuture/internal/services'

export interface AuthStateData {
  authenticated: boolean
  userId?: string
  username?: string
  plan?: string
  roles?: string[]
  permissions?: string[]
  token?: string
  expiresAt?: string
}

interface AuthState {
  authState: AuthStateData | null
  loading: boolean
  load: () => Promise<void>
  updateState: (state: AuthStateData) => Promise<void>
  clearState: () => Promise<void>
  canAccess: (feature: string) => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set) => ({
  authState: null,
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const state = await AuthService.GetState()
      set({ authState: state })
    } finally {
      set({ loading: false })
    }
  },
  updateState: async (state) => {
    await AuthService.UpdateState(state)
    set({ authState: state })
  },
  clearState: async () => {
    await AuthService.ClearState()
    set({ authState: null })
  },
  canAccess: async (feature) => {
    return await AuthService.CanAccess(feature)
  },
}))
