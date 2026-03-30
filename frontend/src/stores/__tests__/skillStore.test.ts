import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  skillService: {
    List: vi.fn(),
    Install: vi.fn(),
    Delete: vi.fn(),
    ToggleEnabled: vi.fn(),
  },
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services', () => ({
  SkillService: serviceMocks.skillService,
}))

import { useSkillStore } from '../skillStore'

describe('skillStore performance guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSkillStore.setState({
      skills: [],
      loading: false,
      loaded: false,
    })
  })

  it('caches the initial load until a forced refresh is requested', async () => {
    serviceMocks.skillService.List.mockResolvedValue([
      {
        id: 'skill-1',
        name: 'Code Review',
        description: 'Review code',
        type: 'prompt',
        source: 'builtin',
        isEnabled: true,
      },
    ])

    await useSkillStore.getState().load()
    await useSkillStore.getState().load()

    expect(serviceMocks.skillService.List).toHaveBeenCalledTimes(1)

    await useSkillStore.getState().load(true)

    expect(serviceMocks.skillService.List).toHaveBeenCalledTimes(2)
  })

  it('updates the enabled state optimistically without refetching the full list', async () => {
    serviceMocks.skillService.ToggleEnabled.mockResolvedValue(undefined)

    useSkillStore.setState({
      skills: [
        {
          id: 'skill-1',
          name: 'Code Review',
          description: 'Review code',
          category: 'development',
          type: 'prompt',
          source: 'builtin',
          system: false,
          enabled: true,
        },
      ],
      loaded: true,
    })

    await useSkillStore.getState().toggleEnabled('skill-1', false)

    expect(serviceMocks.skillService.ToggleEnabled).toHaveBeenCalledWith('skill-1', false)
    expect(serviceMocks.skillService.List).not.toHaveBeenCalled()
    expect(useSkillStore.getState().skills[0]?.enabled).toBe(false)
  })
})
