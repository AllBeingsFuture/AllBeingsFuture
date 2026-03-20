import { create } from 'zustand'
import { SkillService } from '../../bindings/allbeingsfuture/internal/services'

export interface Skill {
  id: string
  name: string
  description: string
  category: string
  type: string
  source: string
  system: boolean
  slashCommand?: string
  toolName?: string
  handler?: string
  path?: string
  author?: string
  tags?: string[]
  enabled: boolean
  config?: Record<string, unknown>
}

interface SkillState {
  skills: Skill[]
  loading: boolean
  load: () => Promise<void>
  install: (skill: Skill) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleEnabled: (id: string, enabled: boolean) => Promise<void>
}

const normalizeSkill = (skill: any): Skill => ({
  id: skill?.id ?? '',
  name: skill?.name ?? skill?.id ?? '',
  description: skill?.description ?? '',
  category: skill?.category ?? 'custom',
  type: skill?.type ?? 'prompt',
  source: skill?.source ?? 'custom',
  system: skill?.system ?? false,
  slashCommand: skill?.slashCommand ?? '',
  toolName: skill?.toolName ?? '',
  handler: skill?.handler ?? '',
  path: skill?.path ?? '',
  author: skill?.author ?? '',
  tags: Array.isArray(skill?.tags) ? skill.tags : [],
  enabled: skill?.isEnabled ?? skill?.enabled ?? true,
  config: (skill?.config ?? undefined) as Record<string, unknown> | undefined,
})

async function reloadSkills(set: (partial: Partial<SkillState>) => void) {
  const skills = await SkillService.List()
  set({ skills: (skills ?? []).map(normalizeSkill) })
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      await reloadSkills(set)
    } finally {
      set({ loading: false })
    }
  },
  install: async (skill) => {
    await SkillService.Install(skill)
    await reloadSkills(set)
  },
  remove: async (id) => {
    await SkillService.Delete(id)
    set((state) => ({ skills: state.skills.filter((skill) => skill.id !== id) }))
  },
  toggleEnabled: async (id, enabled) => {
    await SkillService.ToggleEnabled(id, enabled)
    await reloadSkills(set)
  },
}))
