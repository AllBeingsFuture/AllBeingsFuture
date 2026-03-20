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
  load: () => Promise<void>
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

export const useMcpStore = create<McpState>((set) => ({
  servers: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const servers = await MCPService.List()
      set({ servers: (servers ?? []).map(normalizeMcpServer) })
    } finally {
      set({ loading: false })
    }
  },
  install: async (server) => {
    await MCPService.Install(server)
    const servers = await MCPService.List()
    set({ servers: (servers ?? []).map(normalizeMcpServer) })
  },
  uninstall: async (id) => {
    await MCPService.Uninstall(id)
    set((state) => ({ servers: state.servers.filter((item) => item.id !== id) }))
  },
  updateConfig: async (id, config) => {
    await MCPService.UpdateConfig(id, config)
    const servers = await MCPService.List()
    set({ servers: (servers ?? []).map(normalizeMcpServer) })
  },
  toggleEnabled: async (id, enabled) => {
    await MCPService.ToggleEnabled(id, enabled)
    const servers = await MCPService.List()
    set({ servers: (servers ?? []).map(normalizeMcpServer) })
  },
}))
