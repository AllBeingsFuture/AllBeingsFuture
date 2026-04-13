import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  mcpService: {
    List: vi.fn(),
    Install: vi.fn(),
    Uninstall: vi.fn(),
    UpdateConfig: vi.fn(),
    ToggleEnabled: vi.fn(),
  },
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services', () => ({
  MCPService: serviceMocks.mcpService,
}))

import { useMcpStore } from '../mcpStore'

describe('mcpStore performance guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMcpStore.setState({
      servers: [],
      loading: false,
      loaded: false,
    })
  })

  it('reuses the cached list until a forced reload is requested', async () => {
    serviceMocks.mcpService.List.mockResolvedValue([
      {
        id: 'mcp-1',
        name: 'Web Search',
        transport: 'stdio',
        source: 'builtin',
        isGlobalEnabled: true,
      },
    ])

    await useMcpStore.getState().load()
    await useMcpStore.getState().load()

    expect(serviceMocks.mcpService.List).toHaveBeenCalledTimes(1)

    await useMcpStore.getState().load(true)

    expect(serviceMocks.mcpService.List).toHaveBeenCalledTimes(2)
  })

  it('toggles enabled state locally without fetching the full server list again', async () => {
    serviceMocks.mcpService.ToggleEnabled.mockResolvedValue(undefined)

    useMcpStore.setState({
      servers: [
        {
          id: 'mcp-1',
          name: 'Web Search',
          description: 'Search the web',
          category: 'web',
          command: 'node',
          args: [],
          transport: 'stdio',
          source: 'builtin',
          enabled: true,
          isInstalled: true,
          toolCount: 3,
          hasInstructions: true,
          removable: false,
        },
      ],
      loaded: true,
    })

    await useMcpStore.getState().toggleEnabled('mcp-1', false)

    expect(serviceMocks.mcpService.ToggleEnabled).toHaveBeenCalledWith('mcp-1', false)
    expect(serviceMocks.mcpService.List).not.toHaveBeenCalled()
    expect(useMcpStore.getState().servers[0]?.enabled).toBe(false)
  })
})
