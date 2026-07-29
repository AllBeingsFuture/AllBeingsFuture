import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import ComposerCapabilities from '../ComposerCapabilities'
import { renderWithProviders, screen } from '../../../test/render'
import { useSkillStore } from '../../../stores/skillStore'
import { useMcpStore } from '../../../stores/mcpStore'

const serviceMocks = vi.hoisted(() => ({
  skill: {
    List: vi.fn(),
    ToggleEnabled: vi.fn(),
    Install: vi.fn(),
    Delete: vi.fn(),
  },
  mcp: {
    List: vi.fn(),
    ToggleEnabled: vi.fn(),
    Install: vi.fn(),
    Uninstall: vi.fn(),
    UpdateConfig: vi.fn(),
  },
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  SkillService: serviceMocks.skill,
  MCPService: serviceMocks.mcp,
}))

describe('ComposerCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSkillStore.setState({
      skills: [
        {
          id: 'skill-1',
          name: 'Code Review',
          description: 'Review code',
          category: 'dev',
          type: 'prompt',
          source: 'builtin',
          system: true,
          slashCommand: 'review',
          enabled: true,
        },
        {
          id: 'skill-2',
          name: 'Translate',
          description: 'Translate',
          category: 'writing',
          type: 'prompt',
          source: 'builtin',
          system: true,
          slashCommand: 'translate',
          enabled: false,
        },
      ],
      loading: false,
      loaded: true,
    })
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
          toolCount: 2,
          hasInstructions: false,
          removable: false,
        },
      ],
      loading: false,
      loaded: true,
    })
    serviceMocks.skill.List.mockResolvedValue([])
    serviceMocks.mcp.List.mockResolvedValue([])
    serviceMocks.skill.ToggleEnabled.mockResolvedValue(undefined)
    serviceMocks.mcp.ToggleEnabled.mockResolvedValue(undefined)
  })

  it('opens the capability menu from the + button and opens skills picker', async () => {
    renderWithProviders(<ComposerCapabilities />)

    fireEvent.click(screen.getByLabelText('打开能力菜单'))
    expect(screen.getByTestId('composer-capability-menu')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /技能/ }))
    expect(await screen.findByTestId('capability-picker-skills')).toBeInTheDocument()
    expect(screen.getByText('Code Review')).toBeInTheDocument()
    expect(screen.getByText('/review')).toBeInTheDocument()
  })

  it('shows enabled summary chips and toggles a skill', async () => {
    renderWithProviders(<ComposerCapabilities />)

    expect(screen.getByLabelText('已启用 1 个技能')).toBeInTheDocument()
    expect(screen.getByLabelText('已启用 1 个 MCP')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('已启用 1 个技能'))
    expect(await screen.findByTestId('capability-picker-skills')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('禁用技能 Code Review'))

    await waitFor(() => {
      expect(serviceMocks.skill.ToggleEnabled).toHaveBeenCalledWith('skill-1', false)
    })
  })

  it('opens MCP picker and toggles a server', async () => {
    renderWithProviders(<ComposerCapabilities />)

    fireEvent.click(screen.getByLabelText('打开能力菜单'))
    fireEvent.click(screen.getByRole('menuitem', { name: /MCP/ }))

    expect(await screen.findByTestId('capability-picker-mcp')).toBeInTheDocument()
    expect(screen.getByText('Web Search')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('禁用 MCP Web Search'))

    await waitFor(() => {
      expect(serviceMocks.mcp.ToggleEnabled).toHaveBeenCalledWith('mcp-1', false)
    })
  })
})
