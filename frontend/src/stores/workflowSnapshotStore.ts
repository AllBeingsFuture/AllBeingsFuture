import { create } from 'zustand'
import {
  workflowCore,
  type Workflow,
  type WorkflowDefinition,
  type WorkflowExecution,
  type WorkflowExecutionStep,
  type WorkflowSnapshot,
  type WorkflowStep,
} from '../core/workflow/workflowCore'

interface WorkflowState extends WorkflowSnapshot {
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

function snapshotOf(state: WorkflowState): WorkflowSnapshot {
  return {
    workflows: state.workflows,
    executions: state.executions,
    activeWorkflows: state.activeWorkflows,
    selectedId: state.selectedId,
  }
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
      set(await workflowCore.load(snapshotOf(get())))
    } finally {
      set({ loading: false })
    }
  },

  loadExecutionHistory: async (limit) => {
    set(await workflowCore.loadExecutionHistory(snapshotOf(get()), limit))
  },

  create: async (name, description, definition) => {
    const result = await workflowCore.create(snapshotOf(get()), name, description, definition)
    if (result.patch) set(result.patch)
    return result.workflow
  },

  update: async (id, name, description, definition) => {
    set(await workflowCore.update(snapshotOf(get()), id, name, description, definition))
  },

  remove: async (id) => {
    set(await workflowCore.remove(snapshotOf(get()), id))
  },

  start: async (workflowId, variables) => {
    const result = await workflowCore.start(snapshotOf(get()), workflowId, variables)
    if (result.patch) set(result.patch)
    return result.execution
  },

  stop: async (executionId) => {
    set(await workflowCore.stop(snapshotOf(get()), executionId))
  },

  approveStep: (executionId, stepId, approved) => workflowCore.approveStep(executionId, stepId, approved),

  getStatus: (executionId) => workflowCore.getStatus(snapshotOf(get()), executionId),

  select: (id) => {
    const patch = workflowCore.select(snapshotOf(get()), id)
    if (patch) set(patch)
  },
}))

export type {
  Workflow,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowStep,
}
