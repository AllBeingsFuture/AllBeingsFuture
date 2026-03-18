import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeamPanel from '../TeamPanel'
import { renderWithProviders, screen } from '../../../test/render'

const teamState = {
  definitions: [
    {
      id: 'def-1',
      name: 'UI Port Team',
      description: 'Port claudeops renderer surfaces into allbeingsfuture',
      roles: [
        { id: 'role-1', roleName: 'leader', displayName: 'Leader', color: '#60a5fa' },
        { id: 'role-2', roleName: 'frontend', displayName: 'Frontend', color: '#34d399' },
      ],
    },
  ],
  instances: [
    {
      id: 'instance-1',
      teamId: 'def-1',
      name: 'Build UI Port Team',
      workingDirectory: 'C:/repo/allbeingsfuture',
      task: 'Port claudeops team workspace',
      status: 'running',
      startedAt: '2026-03-11T10:00:00.000Z',
      members: [
        {
          id: 'member-1',
          roleName: 'leader',
          displayName: 'Leader',
          status: 'running',
          color: '#60a5fa',
        },
        {
          id: 'member-2',
          roleName: 'frontend',
          displayName: 'Frontend',
          status: 'idle',
          color: '#34d399',
        },
      ],
    },
  ],
  selectedInstanceId: 'instance-1',
  tasks: [
    {
      id: 'task-1',
      title: 'Audit frontend parity',
      description: 'Compare claudeops UI surfaces with allbeingsfuture shell.',
      status: 'in_progress',
      assignedTo: 'frontend',
      createdAt: '2026-03-11T10:05:00.000Z',
    },
  ],
  messages: [
    {
      id: 'msg-1',
      fromRole: 'leader',
      toRole: 'frontend',
      content: 'Port the teams workspace first.',
      timestamp: '2026-03-11T10:15:00.000Z',
    },
  ],
  loadDefinitions: vi.fn().mockResolvedValue(undefined),
  loadInstances: vi.fn().mockResolvedValue(undefined),
  selectInstance: vi.fn(),
  loadTasks: vi.fn().mockResolvedValue(undefined),
  loadMessages: vi.fn().mockResolvedValue(undefined),
  startInstance: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../../stores/teamStore', () => ({
  useTeamStore: (selector?: (state: typeof teamState) => unknown) =>
    typeof selector === 'function' ? selector(teamState) : teamState,
}))

vi.mock('../TeamTemplateEditor', () => ({
  default: () => <div data-testid="team-template-editor" />,
}))

describe('TeamPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the claudeops-style teams workspace and switches tabs', () => {
    renderWithProviders(<TeamPanel />)

    expect(screen.getByText('团队实例')).toBeInTheDocument()
    expect(screen.getAllByText('Build UI Port Team').length).toBeGreaterThan(0)
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getAllByText('Leader').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    expect(screen.getByText('Audit frontend parity')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '状态' }))
    expect(screen.getByText('进行中成员')).toBeInTheDocument()
  })
})
