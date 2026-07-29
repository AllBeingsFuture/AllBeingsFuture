import { describe, expect, it } from 'vitest'
import { chatCore, type AgentUpdateEvent, type ChatSnapshot } from '../chatCore'

function emptySnapshot(overrides: Partial<ChatSnapshot> = {}): ChatSnapshot {
  return {
    sessions: [],
    selectedId: null,
    messages: [],
    streaming: false,
    chatError: '',
    agents: {},
    childToParent: {},
    ...overrides,
  }
}

const parentId = 'parent-1'
const childId = 'child-1'
const agentId = `persistent-${childId}`

const baseAgent = {
  agentId,
  name: '演示子Agent',
  parentSessionId: parentId,
  childSessionId: childId,
  status: 'running' as const,
  workDir: '/tmp',
  createdAt: '2026-07-29T00:00:00.000Z',
}

describe('chatCore.applyAgentUpdate removed', () => {
  it('removes closed agent from parent agents list and childToParent map', () => {
    const snapshot = emptySnapshot({
      agents: { [parentId]: [baseAgent] },
      childToParent: {
        [childId]: { parentSessionId: parentId, agentId, agentName: baseAgent.name },
      },
    })

    const event: AgentUpdateEvent = {
      parentSessionId: parentId,
      agent: { ...baseAgent, status: 'cancelled' },
      removed: true,
    }

    const patch = chatCore.applyAgentUpdate(snapshot, event)
    expect(patch).not.toBeNull()
    expect(patch!.agents[parentId]).toEqual([])
    expect(patch!.childToParent[childId]).toBeUndefined()
  })

  it('upserts when removed is not set', () => {
    const snapshot = emptySnapshot({ agents: { [parentId]: [] } })
    const event: AgentUpdateEvent = {
      parentSessionId: parentId,
      agent: baseAgent,
    }
    const patch = chatCore.applyAgentUpdate(snapshot, event)
    expect(patch!.agents[parentId]).toHaveLength(1)
    expect(patch!.agents[parentId][0].agentId).toBe(agentId)
  })
})
