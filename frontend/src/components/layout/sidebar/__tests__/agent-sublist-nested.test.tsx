import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgentSubList from '../AgentSubList'
import type { AgentInfo } from '../../../../core/chat/chatCore'

function agent(partial: Partial<AgentInfo> & Pick<AgentInfo, 'agentId' | 'name' | 'parentSessionId' | 'childSessionId'>): AgentInfo {
  return {
    status: 'running',
    workDir: '/tmp/wt',
    createdAt: '2026-01-01',
    ...partial,
  }
}

describe('AgentSubList nested sons', () => {
  it('renders father then nested sons under father.childSessionId', () => {
    const father = agent({
      agentId: 'a-father',
      name: 'dead-code-review',
      parentSessionId: 'grandpa',
      childSessionId: 'father-session',
    })
    const sonA = agent({
      agentId: 'a-son-a',
      name: 'son-a',
      parentSessionId: 'father-session',
      childSessionId: 'son-a-session',
      status: 'idle',
    })
    const sonB = agent({
      agentId: 'a-son-b',
      name: 'son-b',
      parentSessionId: 'father-session',
      childSessionId: 'son-b-session',
      status: 'running',
    })

    const agentsByParent = {
      grandpa: [father],
      'father-session': [sonA, sonB],
    }

    render(
      <AgentSubList
        agents={agentsByParent.grandpa}
        agentsByParent={agentsByParent}
        onSelectSession={vi.fn()}
      />,
    )

    expect(screen.getByText(/1个子任务/)).toBeInTheDocument()
    expect(screen.getByText('Agent: dead-code-review')).toBeInTheDocument()
    // Nested sub-task labels under father
    expect(screen.getByText(/2个子任务/)).toBeInTheDocument()
    expect(screen.getByText('Agent: son-a')).toBeInTheDocument()
    expect(screen.getByText('Agent: son-b')).toBeInTheDocument()
  })

  it('does not show terminal sons', () => {
    const father = agent({
      agentId: 'a-f',
      name: 'father',
      parentSessionId: 'g',
      childSessionId: 'f-s',
    })
    const done = agent({
      agentId: 'a-done',
      name: 'done-son',
      parentSessionId: 'f-s',
      childSessionId: 'd-s',
      status: 'completed',
    })

    render(
      <AgentSubList
        agents={[father]}
        agentsByParent={{ g: [father], 'f-s': [done] }}
      />,
    )

    expect(screen.getByText('Agent: father')).toBeInTheDocument()
    expect(screen.queryByText('Agent: done-son')).not.toBeInTheDocument()
    expect(screen.queryByText(/2个子任务/)).not.toBeInTheDocument()
  })

  it('selects nested son session on click', () => {
    const onSelect = vi.fn()
    const father = agent({
      agentId: 'a-f',
      name: 'father',
      parentSessionId: 'g',
      childSessionId: 'f-s',
    })
    const son = agent({
      agentId: 'a-s',
      name: 'son-x',
      parentSessionId: 'f-s',
      childSessionId: 's-s',
    })

    render(
      <AgentSubList
        agents={[father]}
        agentsByParent={{ g: [father], 'f-s': [son] }}
        onSelectSession={onSelect}
      />,
    )

    fireEvent.click(screen.getByText('Agent: son-x'))
    expect(onSelect).toHaveBeenCalledWith('s-s')
  })

  it('close button calls onCloseAgent with parent and child ids', () => {
    const onClose = vi.fn()
    const father = agent({
      agentId: 'a-f',
      name: 'father',
      parentSessionId: 'g',
      childSessionId: 'f-s',
      status: 'idle',
    })

    render(
      <AgentSubList
        agents={[father]}
        agentsByParent={{ g: [father] }}
        onCloseAgent={onClose}
      />,
    )

    fireEvent.click(screen.getByTitle('关闭子任务（close_agent）'))
    expect(onClose).toHaveBeenCalledWith('g', 'f-s')
  })

  it('hides terminated status (terminal filter)', () => {
    const dead = agent({
      agentId: 'a-dead',
      name: 'gone',
      parentSessionId: 'g',
      childSessionId: 'd',
      status: 'terminated' as any,
    })
    const { container } = render(
      <AgentSubList agents={[dead]} agentsByParent={{ g: [dead] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
