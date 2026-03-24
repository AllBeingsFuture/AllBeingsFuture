import { create } from 'zustand'
import { TeamService } from '../../bindings/allbeingsfuture/internal/services'
import type { TeamDefinition, TeamInstance, TeamRoleDefinition, TeamTaskItem, TeamMessage } from '../../bindings/allbeingsfuture/internal/models/models'

interface TeamState {
  definitions: TeamDefinition[]
  instances: TeamInstance[]
  selectedDefinitionId: string | null
  selectedInstanceId: string | null
  tasks: TeamTaskItem[]
  messages: TeamMessage[]
  loading: boolean

  loadDefinitions: () => Promise<void>
  createDefinition: (name: string, description: string, roles: TeamRoleDefinition[]) => Promise<TeamDefinition | null>
  updateDefinition: (id: string, name: string, description: string) => Promise<void>
  deleteDefinition: (id: string) => Promise<void>
  addRole: (teamId: string, role: TeamRoleDefinition) => Promise<void>
  updateRole: (roleId: string, role: TeamRoleDefinition) => Promise<void>
  deleteRole: (roleId: string) => Promise<void>
  selectDefinition: (id: string | null) => void

  loadInstances: () => Promise<void>
  startInstance: (teamId: string, workingDir: string, task: string) => Promise<TeamInstance | null>
  selectInstance: (id: string | null) => void
  loadTasks: (instanceId: string) => Promise<void>
  loadMessages: (instanceId: string) => Promise<void>
}

export const useTeamStore = create<TeamState>((set, get) => ({
  definitions: [],
  instances: [],
  selectedDefinitionId: null,
  selectedInstanceId: null,
  tasks: [],
  messages: [],
  loading: false,

  loadDefinitions: async () => {
    set({ loading: true })
    try {
      const defs = await TeamService.ListDefinitions()
      set({ definitions: defs ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  createDefinition: async (name, description, roles) => {
    try {
      const def = await TeamService.CreateDefinition(name, description, roles)
      if (def) set(s => ({ definitions: [def, ...s.definitions] }))
      return def
    } catch {
      return null
    }
  },

  updateDefinition: async (id, name, description) => {
    await TeamService.UpdateDefinition(id, name, description)
    await get().loadDefinitions()
  },

  deleteDefinition: async (id) => {
    await TeamService.DeleteDefinition(id)
    set(s => ({
      definitions: s.definitions.filter(d => d.id !== id),
      selectedDefinitionId: s.selectedDefinitionId === id ? null : s.selectedDefinitionId,
    }))
  },

  addRole: async (teamId, role) => {
    await TeamService.AddRole(teamId, role)
    await get().loadDefinitions()
  },

  updateRole: async (roleId, role) => {
    await TeamService.UpdateRole(roleId, role)
    await get().loadDefinitions()
  },

  deleteRole: async (roleId) => {
    await TeamService.DeleteRole(roleId)
    await get().loadDefinitions()
  },

  selectDefinition: (id) => set({ selectedDefinitionId: id }),

  loadInstances: async () => {
    try {
      const instances = await TeamService.ListInstances()
      set({ instances: instances ?? [] })
    } catch { /* ignore */ }
  },

  startInstance: async (teamId, workingDir, task) => {
    try {
      const inst = await TeamService.StartInstance(teamId, workingDir, task)
      if (inst) set(s => ({ instances: [inst, ...s.instances] }))
      return inst
    } catch {
      return null
    }
  },

  selectInstance: (id) => {
    if (id === get().selectedInstanceId) return
    set({ selectedInstanceId: id })
  },

  loadTasks: async (instanceId) => {
    try {
      const tasks = await TeamService.GetTasks(instanceId)
      set({ tasks: tasks ?? [] })
    } catch { /* ignore */ }
  },

  loadMessages: async (instanceId) => {
    try {
      const messages = await TeamService.GetMessages(instanceId, 200)
      set({ messages: messages ?? [] })
    } catch { /* ignore */ }
  },
}))
