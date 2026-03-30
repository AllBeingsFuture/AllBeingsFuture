import { create } from 'zustand'
import { MCPService } from '../../bindings/allbeingsfuture/internal/services'

export interface MCPServer {
  id: string
  name: string
  description: string
  category: string
  command: string
  args: string[]
  transport: string
  source: string
  enabled: boolean
  isInstalled: boolean
  installMethod?: string
  installCommand?: string
  toolCount: number
  hasInstructions: boolean
  removable: boolean
  compatibleProviders?: string[] | 'all'
  tags?: string[]
  author?: string
  homepage?: string
  path?: string
  env?: Record<string, string>
  status?: 'running' | 'stopped' | 'error'
}

interface McpState {
  servers: MCPServer[]
  loading: boolean
  loaded: boolean
  load: (force?: boolean) => Promise<void>
  install: (server: MCPServer) => Promise<void>
  uninstall: (id: string) => Promise<void>
  updateConfig: (id: string, config: Record<string, unknown>) => Promise<void>
  toggleEnabled: (id: string, enabled: boolean) => Promise<void>
}

const normalizeMcpServer = (server: any): MCPServer => ({
  id: server?.id ?? '',
  name: server?.name ?? server?.id ?? '',
  description: server?.description ?? '',
  category: server?.category ?? 'custom',
  command: server?.command ?? '',
  args: Array.isArray(server?.args) ? server.args : [],
  transport: server?.transport ?? 'stdio',
  source: server?.source ?? 'custom',
  enabled: server?.isGlobalEnabled ?? server?.enabled ?? false,
  isInstalled: server?.isInstalled ?? false,
  installMethod: server?.installMethod ?? '',
  installCommand: server?.installCommand ?? '',
  toolCount: server?.toolCount ?? (Array.isArray(server?.tools) ? server.tools.length : 0),
  hasInstructions: server?.hasInstructions ?? false,
  removable: server?.removable ?? false,
  compatibleProviders: server?.compatibleProviders ?? 'all',
  tags: Array.isArray(server?.tags) ? server.tags : [],
  author: server?.author ?? '',
  homepage: server?.homepage ?? '',
  path: server?.path ?? '',
  env: server?.envVars ?? server?.env ?? {},
})

async function reloadServers(set: (partial: Partial<McpState>) => void) {
  const servers = await MCPService.List()
  set({ servers: (servers ?? []).map(normalizeMcpServer), loaded: true })
}

let pendingMcpLoad: Promise<void> | null = null

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loading: false,
  loaded: false,
  load: async (force = false) => {
    if (!force && get().loaded) return
    if (pendingMcpLoad) return pendingMcpLoad

    set({ loading: true })
    pendingMcpLoad = reloadServers(set)
      .finally(() => {
        pendingMcpLoad = null
        set({ loading: false })
      })

    return pendingMcpLoad
  },
  install: async (server) => {
    await MCPService.Install(server)
    await reloadServers(set)
  },
  uninstall: async (id) => {
    await MCPService.Uninstall(id)
    set((state) => ({ servers: state.servers.filter((item) => item.id !== id) }))
  },
  updateConfig: async (id, config) => {
    await MCPService.UpdateConfig(id, config)
    await reloadServers(set)
  },
  toggleEnabled: async (id, enabled) => {
    const previousServers = get().servers

    set((state) => ({
      servers: state.servers.map((server) => (
        server.id === id
          ? { ...server, enabled }
          : server
      )),
    }))

    try {
      await MCPService.ToggleEnabled(id, enabled)
    } catch (error) {
      set({ servers: previousServers })
      throw error
    }
  },
}))
