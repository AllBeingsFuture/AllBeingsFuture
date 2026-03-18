import { create } from 'zustand'
import { WorkflowService } from '../../bindings/allbeingsfuture/internal/services'

export interface WorkflowStep {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
}

export interface Workflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  enabled: boolean
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  results?: Record<string, unknown>
}

interface WorkflowState {
  workflows: Workflow[]
  executions: WorkflowExecution[]
  activeWorkflows: Workflow[]
  selectedId: string | null
  loading: boolean
  load: () => Promise<void>
  loadExecutionHistory: (limit?: number) => Promise<void>
  create: (name: string, description: string, definition: string) => Promise<Workflow | null>
  update: (id: string, name: string, description: string, definition: string) => Promise<void>
  remove: (id: string) => Promise<void>
  start: (workflowId: string, variables?: string) => Promise<WorkflowExecution | null>
  stop: (executionId: string) => Promise<void>
  approveStep: (executionId: string, stepId: string, approved: boolean) => Promise<void>
  getStatus: (executionId: string) => Promise<WorkflowExecution | null>
  select: (id: string | null) => void
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  executions: [],
  activeWorkflows: [],
  selectedId: null,
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const [workflows, active] = await Promise.all([
        WorkflowService.GetAllWorkflows(),
        WorkflowService.GetActiveWorkflows(),
      ])
      set({ workflows: workflows ?? [], activeWorkflows: active ?? [] })
    } finally {
      set({ loading: false })
    }
  },
  loadExecutionHistory: async (limit = 50) => {
    const executions = await WorkflowService.GetExecutionHistory(limit)
    set({ executions: executions ?? [] })
  },
  create: async (name, description, definition) => {
    const wf = await WorkflowService.CreateWorkflow(name, description, definition)
    if (wf) set(s => ({ workflows: [wf, ...s.workflows] }))
    return wf
  },
  update: async (id, name, description, definition) => {
    await WorkflowService.UpdateWorkflow(id, name, description, definition)
    await get().load()
  },
  remove: async (id) => {
    await WorkflowService.DeleteWorkflow(id)
    set(s => ({
      workflows: s.workflows.filter(w => w.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },
  start: async (workflowId, variables = '{}') => {
    const exec = await WorkflowService.StartWorkflow(workflowId, variables)
    await get().load()
    return exec
  },
  stop: async (executionId) => {
    await WorkflowService.StopWorkflow(executionId)
    await get().load()
  },
  approveStep: async (executionId, stepId, approved) => {
    await WorkflowService.ApproveStep(executionId, stepId, approved)
  },
  getStatus: async (executionId) => {
    return await WorkflowService.GetWorkflowStatus(executionId)
  },
  select: (id) => set({ selectedId: id }),
}))
