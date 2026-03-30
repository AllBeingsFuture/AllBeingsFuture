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
  loaded: boolean
  load: (force?: boolean) => Promise<void>
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
  set({ skills: (skills ?? []).map(normalizeSkill), loaded: true })
}

let pendingSkillLoad: Promise<void> | null = null

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  loaded: false,
  load: async (force = false) => {
    if (!force && get().loaded) return
    if (pendingSkillLoad) return pendingSkillLoad

    set({ loading: true })
    pendingSkillLoad = reloadSkills(set)
      .finally(() => {
        pendingSkillLoad = null
        set({ loading: false })
      })

    return pendingSkillLoad
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
    const previousSkills = get().skills

    set((state) => ({
      skills: state.skills.map((skill) => (
        skill.id === id
          ? { ...skill, enabled }
          : skill
      )),
    }))

    try {
      await SkillService.ToggleEnabled(id, enabled)
    } catch (error) {
      set({ skills: previousSkills })
      throw error
    }
  },
}))
