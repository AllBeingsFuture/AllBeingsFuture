import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatCore, type AgentUpdateEvent, type ChatSnapshot } from '../chatCore'

const listAllAgentsMock = vi.hoisted(() => vi.fn())

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  SessionService: {},
  ProcessService: {},
  GitService: {},
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services/processservice', () => ({
  ResumeSession: vi.fn(),
  ListAllAgents: listAllAgentsMock,
  SpawnChildSession: vi.fn(),
  SendToChild: vi.fn(),
}))

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

  it('removes by childSessionId when agentId differs (session-* vs persistent-*)', () => {
    const sessionAgent = {
      ...baseAgent,
      agentId: `session-${childId}`,
      status: 'idle' as const,
    }
    const snapshot = emptySnapshot({
      agents: { [parentId]: [sessionAgent] },
      childToParent: {
        [childId]: { parentSessionId: parentId, agentId: sessionAgent.agentId, agentName: sessionAgent.name },
      },
      sessions: [{
        id: childId,
        name: sessionAgent.name,
        status: 'idle',
        parentSessionId: parentId,
      } as any],
    })

    const event: AgentUpdateEvent = {
      parentSessionId: parentId,
      agent: { ...baseAgent, status: 'cancelled' },
      removed: true,
    }

    const patch = chatCore.applyAgentUpdate(snapshot, event)
    expect(patch!.agents[parentId]).toEqual([])
    expect(patch!.childToParent[childId]).toBeUndefined()
    expect(patch!.sessions.find(s => s.id === childId)?.status).toBe('terminated')
  })

  it('marks child session terminated so poll cannot rehydrate as idle', () => {
    const snapshot = emptySnapshot({
      agents: { [parentId]: [baseAgent] },
      sessions: [{
        id: childId,
        name: baseAgent.name,
        status: 'idle',
        parentSessionId: parentId,
      } as any],
    })

    const patch = chatCore.applyAgentUpdate(snapshot, {
      parentSessionId: parentId,
      agent: { ...baseAgent, status: 'cancelled' },
      removed: true,
    })

    expect(patch!.agents[parentId]).toEqual([])
    expect(patch!.sessions[0].status).toBe('terminated')
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

  it('upserts by childSessionId to avoid session-* / persistent-* duplicates', () => {
    const sessionAgent = { ...baseAgent, agentId: `session-${childId}`, status: 'idle' as const }
    const snapshot = emptySnapshot({ agents: { [parentId]: [sessionAgent] } })
    const patch = chatCore.applyAgentUpdate(snapshot, {
      parentSessionId: parentId,
      agent: baseAgent,
    })
    expect(patch!.agents[parentId]).toHaveLength(1)
    expect(patch!.agents[parentId][0].agentId).toBe(agentId)
    expect(patch!.agents[parentId][0].status).toBe('running')
  })
})

describe('chatCore.fetchAllAgents terminal filter', () => {
  beforeEach(() => {
    listAllAgentsMock.mockReset()
  })

  it('does not rehydrate terminated/cancelled child sessions as idle agents', async () => {
    listAllAgentsMock.mockResolvedValue([])
    const snapshot = emptySnapshot({
      sessions: [
        {
          id: childId,
          name: 'closed child',
          status: 'terminated',
          parentSessionId: parentId,
          workingDirectory: '/tmp',
          providerId: 'codex',
          startedAt: '2026-07-29T00:00:00.000Z',
        } as any,
        {
          id: 'child-cancelled',
          name: 'cancelled child',
          status: 'cancelled',
          parentSessionId: parentId,
          workingDirectory: '/tmp',
          providerId: 'codex',
          startedAt: '2026-07-29T00:00:00.000Z',
        } as any,
      ],
      agents: { [parentId]: [baseAgent] },
    })

    const patch = await chatCore.fetchAllAgents(snapshot)
    expect(patch).not.toBeNull()
    expect(patch!.agents[parentId] ?? []).toEqual([])
    expect(patch!.childToParent[childId]).toBeUndefined()
  })

  it('still rehydrates live idle children not in ListAllAgents (e.g. after restart)', async () => {
    listAllAgentsMock.mockResolvedValue([])
    const snapshot = emptySnapshot({
      sessions: [{
        id: childId,
        name: 'live child',
        status: 'idle',
        parentSessionId: parentId,
        workingDirectory: '/tmp',
        providerId: 'codex',
        startedAt: '2026-07-29T00:00:00.000Z',
      } as any],
    })

    const patch = await chatCore.fetchAllAgents(snapshot)
    expect(patch!.agents[parentId]).toHaveLength(1)
    expect(patch!.agents[parentId][0].status).toBe('idle')
    expect(patch!.agents[parentId][0].childSessionId).toBe(childId)
  })

  it('ignores cancelled agents returned by ListAllAgents', async () => {
    listAllAgentsMock.mockResolvedValue([{
      ...baseAgent,
      status: 'cancelled',
    }])
    const snapshot = emptySnapshot()
    const patch = await chatCore.fetchAllAgents(snapshot)
    // empty grouped vs empty snapshot.agents → may return null or empty agents
    if (patch) {
      expect(patch.agents[parentId] ?? []).toEqual([])
    }
  })
})
