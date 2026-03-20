import { create } from 'zustand'
import { MissionService } from '../../bindings/allbeingsfuture/internal/services'

export interface MissionTask {
  id: string
  name: string
  status: string
  agentId?: string
}

export interface MissionPhase {
  id: string
  name: string
  status: string
  tasks: MissionTask[]
}

export interface Mission {
  id: string
  name: string
  description: string
  status: 'planning' | 'executing' | 'completed' | 'failed'
  phases: MissionPhase[]
  createdAt: string
}

export interface RoleTemplate {
  id: string
  roleName: string
  displayName: string
  providerId: string
  systemPrompt: string
  color?: string
}

interface MissionState {
  missions: Mission[]
  currentMission: Mission | null
  roleTemplates: RoleTemplate[]
  loading: boolean
  load: () => Promise<void>
  loadRoleTemplates: () => Promise<void>
  createMission: (input: Record<string, unknown>) => Promise<Mission | null>
  confirmBrainstorm: (missionId: string, brainstorm: Record<string, unknown>) => Promise<unknown>
  confirmTeamDesign: (missionId: string, design: Record<string, unknown>) => Promise<unknown>
  confirmPhases: (missionId: string, plan: Record<string, unknown>) => Promise<void>
  startMission: (missionId: string) => Promise<void>
  pauseMission: (missionId: string) => Promise<void>
  resumeMission: (missionId: string) => Promise<void>
  abortMission: (missionId: string) => Promise<void>
  skipPhase: (missionId: string) => Promise<void>
  getMission: (missionId: string) => Promise<void>
  deleteMission: (missionId: string) => Promise<void>
}

export const useMissionStore = create<MissionState>((set, get) => ({
  missions: [],
  currentMission: null,
  roleTemplates: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const missions = await MissionService.ListMissions()
      set({ missions: missions ?? [] })
    } finally {
      set({ loading: false })
    }
  },
  loadRoleTemplates: async () => {
    const templates = await MissionService.ListRoleTemplates()
    set({ roleTemplates: templates ?? [] })
  },
  createMission: async (input) => {
    const result = await MissionService.CreateMission(input)
    await get().load()
    return result
  },
  confirmBrainstorm: async (missionId, brainstorm) => {
    const result = await MissionService.ConfirmBrainstorm(missionId, brainstorm)
    return result
  },
  confirmTeamDesign: async (missionId, design) => {
    const result = await MissionService.ConfirmTeamDesign(missionId, design)
    return result
  },
  confirmPhases: async (missionId, plan) => {
    await MissionService.ConfirmPhases(missionId, plan)
  },
  startMission: async (missionId) => {
    await MissionService.StartMission(missionId)
    await get().getMission(missionId)
  },
  pauseMission: async (missionId) => {
    await MissionService.PauseMission(missionId)
    await get().getMission(missionId)
  },
  resumeMission: async (missionId) => {
    await MissionService.ResumeMission(missionId)
    await get().getMission(missionId)
  },
  abortMission: async (missionId) => {
    await MissionService.AbortMission(missionId)
    await get().getMission(missionId)
  },
  skipPhase: async (missionId) => {
    await MissionService.SkipCurrentPhase(missionId)
    await get().getMission(missionId)
  },
  getMission: async (missionId) => {
    const mission = await MissionService.GetMission(missionId)
    set({ currentMission: mission })
  },
  deleteMission: async (missionId) => {
    await MissionService.DeleteMission(missionId)
    set(s => ({
      missions: s.missions.filter(m => m.id !== missionId),
      currentMission: s.currentMission?.id === missionId ? null : s.currentMission,
    }))
  },
}))
