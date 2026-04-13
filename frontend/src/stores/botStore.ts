import { create } from 'zustand'
import { BotService } from '../../bindings/allbeingsfuture/internal/services'

export interface BotCredentialField {
  key: string
  label: string
  secret?: boolean
  hint?: string
}

export interface BotCatalogItem {
  type: string
  label: string
  category: string
  source: 'openclaw-ui' | 'openclaw-extension' | 'abf'
  sourceLabel: string
  controlSurface: 'card' | 'extension' | 'legacy'
  extensionId?: string
  description: string
  integrationLabel: string
  supportsTestPush: boolean
  hasDedicatedSettings: boolean
  fields: BotCredentialField[]
}

export interface IMBot {
  id: string
  type: string
  name: string
  agent_profile_id: string
  enabled: boolean
  credentials: Record<string, string>
  config: Record<string, any>
  catalog: BotCatalogItem | null
}

interface BotState {
  bots: IMBot[]
  catalog: BotCatalogItem[]
  loading: boolean
  catalogLoading: boolean
  load: () => Promise<void>
  create: (bot: IMBot) => Promise<void>
  update: (botId: string, bot: IMBot) => Promise<void>
  remove: (botId: string) => Promise<void>
  toggle: (botId: string, enabled: boolean) => Promise<void>
}

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
      .map(([key, entryValue]) => [key, String(entryValue)]),
  )
}

const normalizeCatalogField = (raw: any): BotCredentialField => ({
  key: raw?.key ?? '',
  label: raw?.label ?? raw?.key ?? '',
  secret: Boolean(raw?.secret),
  hint: raw?.hint ?? undefined,
})

const normalizeCatalogItem = (raw: any): BotCatalogItem => ({
  type: raw?.type ?? '',
  label: raw?.label ?? raw?.type ?? '',
  category: raw?.category ?? '未分类',
  source: raw?.source ?? 'abf',
  sourceLabel: raw?.sourceLabel ?? 'ABF',
  controlSurface: raw?.controlSurface ?? 'legacy',
  extensionId: raw?.extensionId ?? undefined,
  description: raw?.description ?? '',
  integrationLabel: raw?.integrationLabel ?? '未接通',
  supportsTestPush: Boolean(raw?.supportsTestPush),
  hasDedicatedSettings: Boolean(raw?.hasDedicatedSettings),
  fields: Array.isArray(raw?.fields) ? raw.fields.map(normalizeCatalogField) : [],
})

const normalizeConfig = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...(value as Record<string, any>) }
}

const normalizeBot = (
  raw: any,
  catalogMap: Map<string, BotCatalogItem>,
): IMBot => {
  const config = normalizeConfig(raw?.config)
  const credentials = normalizeStringRecord(config.credentials ?? raw?.credentials)
  const catalog = raw?.catalog
    ? normalizeCatalogItem(raw.catalog)
    : catalogMap.get(raw?.type ?? '') ?? null

  return {
    id: raw?.id ?? '',
    type: raw?.type ?? '',
    name: raw?.name ?? '',
    agent_profile_id: raw?.agent_profile_id ?? config.agent_profile_id ?? 'default',
    enabled: Boolean(raw?.enabled),
    credentials,
    config: {
      ...config,
      credentials,
      agent_profile_id: raw?.agent_profile_id ?? config.agent_profile_id ?? 'default',
    },
    catalog,
  }
}

async function reloadBots(
  set: (partial: Partial<BotState>) => void,
  catalogMap: Map<string, BotCatalogItem>,
): Promise<void> {
  const bots = await BotService.List()
  set({ bots: (bots ?? []).map((bot) => normalizeBot(bot, catalogMap)) })
}

export const useBotStore = create<BotState>((set, get) => ({
  bots: [],
  catalog: [],
  loading: false,
  catalogLoading: false,
  load: async () => {
    set({ loading: true, catalogLoading: true })
    try {
      const [catalogRaw, botsRaw] = await Promise.all([
        BotService.GetCatalog(),
        BotService.List(),
      ])
      const catalog = (catalogRaw ?? []).map(normalizeCatalogItem)
      const catalogMap = new Map(catalog.map(item => [item.type, item]))
      set({
        catalog,
        bots: (botsRaw ?? []).map((bot) => normalizeBot(bot, catalogMap)),
      })
    } finally {
      set({ loading: false, catalogLoading: false })
    }
  },
  create: async (bot) => {
    await BotService.Create(bot)
    const catalogMap = new Map(get().catalog.map(item => [item.type, item]))
    await reloadBots(set, catalogMap)
  },
  update: async (botId, bot) => {
    await BotService.Update(botId, bot)
    const catalogMap = new Map(get().catalog.map(item => [item.type, item]))
    await reloadBots(set, catalogMap)
  },
  remove: async (botId) => {
    await BotService.Delete(botId)
    set((state) => ({ bots: state.bots.filter((b) => b.id !== botId) }))
  },
  toggle: async (botId, enabled) => {
    await BotService.Toggle(botId, enabled)
    const catalogMap = new Map(get().catalog.map(item => [item.type, item]))
    await reloadBots(set, catalogMap)
  },
}))
