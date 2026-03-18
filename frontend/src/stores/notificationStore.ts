import { create } from 'zustand'
import { NotificationService } from '../../bindings/allbeingsfuture/internal/services'

export interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: string
  acknowledged: boolean
  sessionId?: string
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (event: Notification) => void
  acknowledge: (sessionId: string, type: string) => Promise<boolean>
  clear: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (event) => {
    set(s => ({ notifications: [event, ...s.notifications].slice(0, 100) }))
  },
  acknowledge: async (sessionId, type) => {
    const result = await NotificationService.Acknowledge(sessionId, type)
    set(s => ({
      notifications: s.notifications.filter(
        n => !(n.sessionId === sessionId && n.type === type)
      ),
    }))
    return result
  },
  clear: () => set({ notifications: [] }),
}))
