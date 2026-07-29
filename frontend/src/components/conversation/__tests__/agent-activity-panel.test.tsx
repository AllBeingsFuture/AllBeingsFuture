import { describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../test/render'
import AgentActivityPanel from '../AgentActivityPanel'

const permissionStream = {
  phase: 'waiting_permission' as const,
  lastSequence: 3,
  permission: {
    requestId: 'permission-1',
    title: 'Allow file modification?',
    description: 'The agent wants to update src/App.tsx.',
    options: [
      { optionId: 'yes-once', label: 'Allow once', kind: 'allow_once' as const },
      { optionId: 'no-once', label: 'Reject', kind: 'reject_once' as const },
    ],
  },
}

describe('AgentActivityPanel', () => {
  it('renders unfinished plan progress and submits the exact permission option id', async () => {
    const onPermissionResponse = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(
      <AgentActivityPanel
        stream={{
          ...permissionStream,
          plan: { entries: [{ id: 'step-1', title: 'Inspect files', status: 'in_progress' }] },
        }}
        onPermissionResponse={onPermissionResponse}
      />,
    )

    expect(screen.getByText('Inspect files')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: 'Allow file modification?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))

    await waitFor(() => {
      expect(onPermissionResponse).toHaveBeenCalledWith('permission-1', 'yes-once')
    })
  })

  it('hides plan when every entry is completed', () => {
    renderWithProviders(
      <AgentActivityPanel
        stream={{
          phase: 'running',
          lastSequence: 4,
          plan: {
            entries: [
              { id: 'step-1', title: 'Inspect files', status: 'completed' },
              { id: 'step-2', title: 'Update README', status: 'completed' },
            ],
          },
        }}
        onPermissionResponse={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('agent-activity-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Inspect files')).not.toBeInTheDocument()
  })

  it('hides plan and status after the stream is no longer active', () => {
    renderWithProviders(
      <AgentActivityPanel
        stream={{
          phase: 'done',
          lastSequence: 8,
          statusMessage: 'Working…',
          plan: { entries: [{ id: 'step-1', title: 'Inspect files', status: 'in_progress' }] },
        }}
        onPermissionResponse={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('agent-activity-panel')).not.toBeInTheDocument()
  })

  it('keeps the prompt actionable and announces response failures', async () => {
    const onPermissionResponse = vi.fn().mockRejectedValue(new Error('Connection lost'))
    renderWithProviders(
      <AgentActivityPanel stream={permissionStream} onPermissionResponse={onPermissionResponse} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })
})
