import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  workflowService: {
    GetAllWorkflows: vi.fn(),
    GetActiveWorkflows: vi.fn(),
    GetExecutionHistory: vi.fn(),
    CreateWorkflow: vi.fn(),
    UpdateWorkflow: vi.fn(),
    DeleteWorkflow: vi.fn(),
    StartWorkflow: vi.fn(),
    StopWorkflow: vi.fn(),
    ApproveStep: vi.fn(),
    GetWorkflowStatus: vi.fn(),
  },
}))

vi.mock('../../../bindings/allbeingsfuture/internal/services', () => ({
  WorkflowService: serviceMocks.workflowService,
}))

import { useWorkflowStore } from '../workflowStore'

function resetStore() {
  useWorkflowStore.setState({
    workflows: [],
    executions: [],
    activeWorkflows: [],
    selectedId: null,
    loading: false,
  })
}

describe('workflowStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    resetStore()
  })

  it('normalizes workflow definitions and active executions from backend payloads', async () => {
    serviceMocks.workflowService.GetAllWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        name: 'Build',
        description: 'Compile project',
        steps_json: '{"steps":[{"id":"step-1","name":"Install","type":"shell"}]}',
        created_at: '2026-03-30T09:00:00.000Z',
      },
      {
        id: 'wf-2',
        name: 'Deploy',
        description: '',
        steps: [{ id: 'step-2', name: 'Approve', type: 'approval' }],
        is_template: true,
      },
    ])
    serviceMocks.workflowService.GetActiveWorkflows.mockResolvedValue([
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        status: 'running',
        current_step: 1,
        started_at: '2026-03-30T09:01:00.000Z',
        results_json: '{"ok":true}',
      },
    ])

    useWorkflowStore.setState({
      selectedId: 'wf-1',
      executions: [
        {
          id: 'exec-old',
          workflowId: 'wf-2',
          status: 'completed',
          startedAt: '2026-03-29T08:00:00.000Z',
          completedAt: '2026-03-29T08:02:05.000Z',
        } as any,
      ],
    })

    await useWorkflowStore.getState().load()

    const state = useWorkflowStore.getState()
    expect(state.loading).toBe(false)
    expect(state.workflows).toHaveLength(2)
    expect(state.workflows[0]).toMatchObject({
      id: 'wf-1',
      name: 'Build',
      createdAt: '2026-03-30T09:00:00.000Z',
    })
    expect(state.workflows[0]?.definition.steps).toEqual([
      { id: 'step-1', name: 'Install', type: 'shell' },
    ])
    expect(state.workflows[1]?.isTemplate).toBe(true)
    expect(state.activeWorkflows[0]).toMatchObject({
      id: 'exec-1',
      workflowId: 'wf-1',
      workflowName: 'Build',
      currentStep: 1,
      results: { ok: true },
      startedAt: '2026-03-30T09:01:00.000Z',
    })
    expect(state.executions[0]).toMatchObject({
      id: 'exec-old',
      workflowId: 'wf-2',
      workflowName: 'Deploy',
      duration: '2分 5秒',
    })
  })

  it('updates workflow entities locally without triggering a full reload', async () => {
    useWorkflowStore.setState({
      workflows: [
        {
          id: 'wf-1',
          name: 'Old Name',
          description: 'old',
          definition: { steps: [] },
          steps: [],
          enabled: true,
        },
      ],
      activeWorkflows: [
        {
          id: 'exec-active',
          workflowId: 'wf-1',
          workflowName: 'Old Name',
          status: 'running',
        } as any,
      ],
      executions: [
        {
          id: 'exec-history',
          workflowId: 'wf-1',
          workflowName: 'Old Name',
          status: 'completed',
        } as any,
      ],
      selectedId: 'wf-1',
    })
    serviceMocks.workflowService.UpdateWorkflow.mockResolvedValue(undefined)

    await useWorkflowStore.getState().update(
      'wf-1',
      'New Name',
      'new description',
      '{"steps":[{"id":"step-build","name":"Build","type":"shell"}]}',
    )

    const state = useWorkflowStore.getState()
    expect(serviceMocks.workflowService.UpdateWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'New Name',
      'new description',
      '{"steps":[{"id":"step-build","name":"Build","type":"shell"}]}',
    )
    expect(serviceMocks.workflowService.GetAllWorkflows).not.toHaveBeenCalled()
    expect(state.workflows[0]).toMatchObject({
      id: 'wf-1',
      name: 'New Name',
      description: 'new description',
    })
    expect(state.workflows[0]?.definition.steps).toEqual([
      { id: 'step-build', name: 'Build', type: 'shell' },
    ])
    expect(state.activeWorkflows[0]?.workflowName).toBe('New Name')
    expect(state.executions[0]?.workflowName).toBe('New Name')
    expect(state.selectedId).toBe('wf-1')
  })

  it('moves a stopped execution out of the active list and into history', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T10:00:00.000Z'))

    useWorkflowStore.setState({
      workflows: [
        {
          id: 'wf-1',
          name: 'Build',
          description: '',
          definition: { steps: [] },
          steps: [],
          enabled: true,
        },
      ],
      activeWorkflows: [
        {
          id: 'exec-1',
          workflowId: 'wf-1',
          workflowName: 'Build',
          status: 'running',
          startedAt: '2026-03-30T09:59:30.000Z',
        } as any,
      ],
      executions: [],
    })
    serviceMocks.workflowService.StopWorkflow.mockResolvedValue(undefined)

    await useWorkflowStore.getState().stop('exec-1')

    const state = useWorkflowStore.getState()
    expect(serviceMocks.workflowService.StopWorkflow).toHaveBeenCalledWith('exec-1')
    expect(state.activeWorkflows).toEqual([])
    expect(state.executions[0]).toMatchObject({
      id: 'exec-1',
      workflowId: 'wf-1',
      status: 'cancelled',
      completedAt: '2026-03-30T10:00:00.000Z',
      duration: '30秒',
    })
  })

  it('loads execution history with camelCase fields and parsed results', async () => {
    useWorkflowStore.setState({
      workflows: [
        {
          id: 'wf-1',
          name: 'Build',
          description: '',
          definition: { steps: [] },
          steps: [],
          enabled: true,
        },
      ],
    })
    serviceMocks.workflowService.GetExecutionHistory.mockResolvedValue([
      {
        id: 'exec-2',
        workflow_id: 'wf-1',
        status: 'completed',
        started_at: '2026-03-30T09:00:00.000Z',
        completed_at: '2026-03-30T09:02:05.000Z',
        results_json: '[{"ok":true}]',
      },
    ])

    await useWorkflowStore.getState().loadExecutionHistory(10)

    expect(serviceMocks.workflowService.GetExecutionHistory).toHaveBeenCalledWith(10)
    expect(useWorkflowStore.getState().executions[0]).toMatchObject({
      id: 'exec-2',
      workflowId: 'wf-1',
      workflowName: 'Build',
      startedAt: '2026-03-30T09:00:00.000Z',
      completedAt: '2026-03-30T09:02:05.000Z',
      duration: '2分 5秒',
      results: [{ ok: true }],
    })
  })
})
