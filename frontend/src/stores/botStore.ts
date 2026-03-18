import { create } from 'zustand'
import { BotService } from '../../bindings/allbeingsfuture/internal/services'

export interface IMBot {
  id: string
  type: string
  name: string
  agent_profile_id: string
  enabled: boolean
  credentials: Record<string, string>
}

interface BotState {
  bots: IMBot[]
  loading: boolean
  load: () => Promise<void>
  create: (bot: IMBot) => Promise<void>
  update: (botId: string, bot: IMBot) => Promise<void>
  remove: (botId: string) => Promise<void>
  toggle: (botId: string, enabled: boolean) => Promise<void>
}

const normalizeBot = (raw: any): IMBot => ({
  id: raw?.id ?? '',
  type: raw?.type ?? '',
  name: raw?.name ?? '',
  agent_profile_id: raw?.agent_profile_id ?? 'default',
  enabled: raw?.enabled ?? false,
  credentials: raw?.credentials ?? {},
})

export const useBotStore = create<BotState>((set) => ({
  bots: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const bots = await BotService.List()
      set({ bots: (bots ?? []).map(normalizeBot) })
    } finally {
      set({ loading: false })
    }
  },
  create: async (bot) => {
    await BotService.Create(bot)
    const bots = await BotService.List()
    set({ bots: (bots ?? []).map(normalizeBot) })
  },
  update: async (botId, bot) => {
    await BotService.Update(botId, bot)
    const bots = await BotService.List()
    set({ bots: (bots ?? []).map(normalizeBot) })
  },
  remove: async (botId) => {
    await BotService.Delete(botId)
    set((state) => ({ bots: state.bots.filter((b) => b.id !== botId) }))
  },
  toggle: async (botId, enabled) => {
    await BotService.Toggle(botId, enabled)
    const bots = await BotService.List()
    set({ bots: (bots ?? []).map(normalizeBot) })
  },
}))
