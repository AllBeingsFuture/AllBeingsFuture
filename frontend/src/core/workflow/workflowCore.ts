import { WorkflowService } from '../../../bindings/allbeingsfuture/internal/services'

export interface WorkflowStep {
  id: string
  name: string
  type: string
  config?: Record<string, unknown>
  dependsOn?: string[]
  [key: string]: unknown
}

export interface WorkflowDefinition {
  steps: WorkflowStep[]
  [key: string]: unknown
}

export interface Workflow {
  id: string
  name: string
  description: string
  definition: WorkflowDefinition
  steps: WorkflowStep[]
  enabled: boolean
  createdAt?: string
  updatedAt?: string
  isTemplate?: boolean
  [key: string]: unknown
}

export interface WorkflowExecutionStep {
  id: string
  name?: string
  type?: string
  status: string
  [key: string]: unknown
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  workflowName?: string
  status: string
  startedAt?: string
  completedAt?: string
  currentStep?: number
  duration?: string
  results?: unknown
  steps?: WorkflowExecutionStep[]
  [key: string]: unknown
}

export interface WorkflowSnapshot {
  workflows: Workflow[]
  executions: WorkflowExecution[]
  activeWorkflows: WorkflowExecution[]
  selectedId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeWorkflowSteps(value: unknown): WorkflowStep[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map((step, index) => {
    const source = isRecord(step) ? step : {}
    const id = getString(source.id) || `step-${index + 1}`
    const name = getString(source.name) || id
    const type = getString(source.type) || 'unknown'
    const dependsOnSource = source.dependsOn ?? source.depends_on
    const dependsOn = Array.isArray(dependsOnSource)
      ? dependsOnSource.map(item => String(item)).filter(Boolean)
      : undefined
    const config = isRecord(source.config) ? source.config : undefined

    return {
      ...source,
      id,
      name,
      type,
      ...(dependsOn && dependsOn.length > 0 ? { dependsOn } : {}),
      ...(config ? { config } : {}),
    }
  })
}

function normalizeWorkflowDefinition(value: unknown): WorkflowDefinition {
  const parsed = parseJsonValue(value)
  if (Array.isArray(parsed)) {
    return { steps: normalizeWorkflowSteps(parsed) }
  }
  if (isRecord(parsed)) {
    const nestedSteps = parsed.steps ?? parsed.steps_json
    return {
      ...parsed,
      steps: normalizeWorkflowSteps(nestedSteps),
    }
  }
  return { steps: [] }
}

function normalizeWorkflow(raw: unknown): Workflow {
  const source = isRecord(raw) ? raw : {}
  const definition = normalizeWorkflowDefinition(
    source.definition ?? source.steps ?? source.steps_json,
  )

  return {
    ...source,
    id: getString(source.id) || '',
    name: getString(source.name) || '',
    description: getString(source.description) || '',
    definition,
    steps: definition.steps,
    enabled: getBoolean(source.enabled) ?? true,
    createdAt: getString(source.createdAt ?? source.created_at),
    updatedAt: getString(source.updatedAt ?? source.updated_at),
    isTemplate: getBoolean(source.isTemplate ?? source.is_template),
  }
}

function normalizeExecutionSteps(value: unknown): WorkflowExecutionStep[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map((step, index) => {
    const source = isRecord(step) ? step : {}
    return {
      ...source,
      id: getString(source.id) || `step-${index + 1}`,
      name: getString(source.name),
      type: getString(source.type),
      status: getString(source.status) || 'pending',
    }
  })
}

function formatDuration(startedAt?: string, completedAt?: string) {
  if (!startedAt || !completedAt) return undefined
  const started = Date.parse(startedAt)
  const completed = Date.parse(completedAt)
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return undefined

  const totalSeconds = Math.round((completed - started) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}小时 ${minutes}分`
  if (minutes > 0) return `${minutes}分 ${seconds}秒`
  return `${seconds}秒`
}

function normalizeExecution(raw: unknown, workflows: Workflow[]): WorkflowExecution {
  const source = isRecord(raw) ? raw : {}
  const workflowId = getString(source.workflowId ?? source.workflow_id) || ''
  const startedAt = getString(source.startedAt ?? source.started_at)
  const completedAt = getString(source.completedAt ?? source.completed_at)
  const workflowName = getString(source.workflowName ?? source.workflow_name)
    || workflows.find(workflow => workflow.id === workflowId)?.name

  return {
    ...source,
    id: getString(source.id) || '',
    workflowId,
    workflowName,
    status: getString(source.status) || 'running',
    startedAt,
    completedAt,
    currentStep: getNumber(source.currentStep ?? source.current_step),
    duration: getString(source.duration) || formatDuration(startedAt, completedAt),
    results: parseJsonValue(source.results ?? source.results_json),
    steps: normalizeExecutionSteps(source.steps),
  }
}

function normalizeWorkflowList(raw: unknown): Workflow[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => normalizeWorkflow(item))
}

function normalizeExecutionList(raw: unknown, workflows: Workflow[]): WorkflowExecution[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => normalizeExecution(item, workflows))
}

function resolveSelectedId(selectedId: string | null, workflows: Workflow[]) {
  if (!selectedId) return null
  return workflows.some(workflow => workflow.id === selectedId) ? selectedId : null
}

function upsertExecution(
  executions: WorkflowExecution[],
  nextExecution: WorkflowExecution,
) {
  return [nextExecution, ...executions.filter(execution => execution.id !== nextExecution.id)]
}

export const workflowCore = {
  async load(snapshot: WorkflowSnapshot) {
    const [rawWorkflows, rawActiveWorkflows] = await Promise.all([
      WorkflowService.GetAllWorkflows(),
      WorkflowService.GetActiveWorkflows(),
    ])
    const workflows = normalizeWorkflowList(rawWorkflows)
    return {
      workflows,
      activeWorkflows: normalizeExecutionList(rawActiveWorkflows, workflows),
      executions: normalizeExecutionList(snapshot.executions, workflows),
      selectedId: resolveSelectedId(snapshot.selectedId, workflows),
    }
  },

  async loadExecutionHistory(snapshot: WorkflowSnapshot, limit = 50) {
    const rawExecutions = await WorkflowService.GetExecutionHistory(limit)
    return {
      executions: normalizeExecutionList(rawExecutions, snapshot.workflows),
    }
  },

  async create(snapshot: WorkflowSnapshot, name: string, description: string, definition: string) {
    const rawWorkflow = await WorkflowService.CreateWorkflow(name, description, definition)
    if (!rawWorkflow) return { workflow: null, patch: null }

    const workflow = normalizeWorkflow(rawWorkflow)
    return {
      workflow,
      patch: { workflows: [workflow, ...snapshot.workflows] },
    }
  },

  async update(snapshot: WorkflowSnapshot, id: string, name: string, description: string, definition: string) {
    await WorkflowService.UpdateWorkflow(id, name, description, definition)

    const previousWorkflow = snapshot.workflows.find(workflow => workflow.id === id)
    const workflow = normalizeWorkflow({
      ...previousWorkflow,
      id,
      name,
      description,
      definition,
    })
    const workflows = snapshot.workflows.some(item => item.id === id)
      ? snapshot.workflows.map(item => item.id === id ? workflow : item)
      : [workflow, ...snapshot.workflows]

    return {
      workflows,
      activeWorkflows: snapshot.activeWorkflows.map(execution => (
        execution.workflowId === id
          ? { ...execution, workflowName: workflow.name }
          : execution
      )),
      executions: snapshot.executions.map(execution => (
        execution.workflowId === id
          ? { ...execution, workflowName: workflow.name }
          : execution
      )),
      selectedId: resolveSelectedId(snapshot.selectedId, workflows),
    }
  },

  async remove(snapshot: WorkflowSnapshot, id: string) {
    await WorkflowService.DeleteWorkflow(id)
    return {
      workflows: snapshot.workflows.filter(workflow => workflow.id !== id),
      activeWorkflows: snapshot.activeWorkflows.filter(execution => execution.workflowId !== id),
      executions: snapshot.executions.filter(execution => execution.workflowId !== id),
      selectedId: snapshot.selectedId === id ? null : snapshot.selectedId,
    }
  },

  async start(snapshot: WorkflowSnapshot, workflowId: string, variables = '{}') {
    const rawExecution = await WorkflowService.StartWorkflow(workflowId, variables || '{}')
    if (!rawExecution) return { execution: null, patch: null }

    const execution = normalizeExecution(rawExecution, snapshot.workflows)
    return {
      execution,
      patch: {
        activeWorkflows: upsertExecution(snapshot.activeWorkflows, execution),
      },
    }
  },

  async stop(snapshot: WorkflowSnapshot, executionId: string) {
    await WorkflowService.StopWorkflow(executionId)

    const existingExecution = snapshot.activeWorkflows.find(execution => execution.id === executionId)
      || snapshot.executions.find(execution => execution.id === executionId)
    const nextExecution = existingExecution
      ? normalizeExecution({
        ...existingExecution,
        status: 'cancelled',
        completedAt: existingExecution.completedAt || new Date().toISOString(),
      }, snapshot.workflows)
      : null

    return {
      activeWorkflows: snapshot.activeWorkflows.filter(execution => execution.id !== executionId),
      executions: nextExecution
        ? upsertExecution(snapshot.executions, nextExecution)
        : snapshot.executions,
    }
  },

  approveStep(executionId: string, stepId: string, approved: boolean) {
    return WorkflowService.ApproveStep(executionId, stepId, approved)
  },

  async getStatus(snapshot: WorkflowSnapshot, executionId: string) {
    const rawExecution = await WorkflowService.GetWorkflowStatus(executionId)
    return rawExecution ? normalizeExecution(rawExecution, snapshot.workflows) : null
  },

  select(snapshot: WorkflowSnapshot, id: string | null) {
    if (id === snapshot.selectedId) return null
    return { selectedId: id }
  },
}

export type WorkflowCore = typeof workflowCore
