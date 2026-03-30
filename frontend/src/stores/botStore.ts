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
  loaded: boolean
  load: (force?: boolean) => Promise<void>
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

async function reloadBots(set: (partial: Partial<BotState>) => void) {
  const bots = await BotService.List()
  set({ bots: (bots ?? []).map(normalizeBot), loaded: true })
}

let pendingBotLoad: Promise<void> | null = null

export const useBotStore = create<BotState>((set, get) => ({
  bots: [],
  loading: false,
  loaded: false,
  load: async (force = false) => {
    if (!force && get().loaded) return
    if (pendingBotLoad) return pendingBotLoad

    set({ loading: true })
    pendingBotLoad = reloadBots(set)
      .finally(() => {
        pendingBotLoad = null
        set({ loading: false })
      })

    return pendingBotLoad
  },
  create: async (bot) => {
    await BotService.Create(bot)
    await reloadBots(set)
  },
  update: async (botId, bot) => {
    await BotService.Update(botId, bot)
    await reloadBots(set)
  },
  remove: async (botId) => {
    await BotService.Delete(botId)
    set((state) => ({ bots: state.bots.filter((b) => b.id !== botId), loaded: true }))
  },
  toggle: async (botId, enabled) => {
    await BotService.Toggle(botId, enabled)
    await reloadBots(set)
  },
}))
