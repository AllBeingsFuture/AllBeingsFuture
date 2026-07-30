import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatCore, type AgentUpdateEvent, type ChatSnapshot } from '../chatCore'

const listAllAgentsMock = vi.hoisted(() => vi.fn())
const serviceMocks = vi.hoisted(() => ({
  Delete: vi.fn(),
  StopProcess: vi.fn(),
  RemoveWorktree: vi.fn(),
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  SessionService: { Delete: serviceMocks.Delete },
  ProcessService: { StopProcess: serviceMocks.StopProcess },
  GitService: { RemoveWorktree: serviceMocks.RemoveWorktree },
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

describe('chatCore.remove recursive subtree', () => {
  beforeEach(() => {
    serviceMocks.Delete.mockReset().mockResolvedValue(undefined)
    serviceMocks.StopProcess.mockReset().mockResolvedValue(undefined)
    serviceMocks.RemoveWorktree.mockReset().mockResolvedValue(undefined)
  })

  it('removes grandfather + father + son and cleans agents/childToParent', async () => {
    const gId = 'grandpa-1'
    const fId = 'father-1'
    const sId = 'son-1'
    const otherId = 'other-1'
    const agentF = {
      agentId: `persistent-${fId}`,
      name: '父亲',
      parentSessionId: gId,
      childSessionId: fId,
      status: 'idle' as const,
      workDir: '/tmp/f',
      createdAt: '2026-07-29T00:00:00.000Z',
    }
    const agentS = {
      agentId: `persistent-${sId}`,
      name: '儿子',
      parentSessionId: fId,
      childSessionId: sId,
      status: 'idle' as const,
      workDir: '/tmp/s',
      createdAt: '2026-07-29T00:00:00.000Z',
    }

    const snapshot = emptySnapshot({
      selectedId: sId,
      messages: [{ role: 'user', content: 'hi' } as never],
      streaming: true,
      sessions: [
        { id: gId, name: 'G', status: 'idle' } as any,
        { id: fId, name: 'F', status: 'idle', parentSessionId: gId } as any,
        { id: sId, name: 'S', status: 'idle', parentSessionId: fId } as any,
        { id: otherId, name: 'Other', status: 'idle' } as any,
      ],
      agents: {
        [gId]: [agentF],
        [fId]: [agentS],
      },
      childToParent: {
        [fId]: { parentSessionId: gId, agentId: agentF.agentId, agentName: agentF.name },
        [sId]: { parentSessionId: fId, agentId: agentS.agentId, agentName: agentS.name },
      },
    })

    const patch = await chatCore.remove(snapshot, gId)

    expect(serviceMocks.Delete).toHaveBeenCalledTimes(1)
    expect(serviceMocks.Delete).toHaveBeenCalledWith(gId)
    expect(serviceMocks.StopProcess).toHaveBeenCalledWith(gId)
    expect(serviceMocks.StopProcess).toHaveBeenCalledWith(fId)
    expect(serviceMocks.StopProcess).toHaveBeenCalledWith(sId)

    const remainingIds = patch.sessions.map(session => session.id)
    expect(remainingIds).toEqual([otherId])
    expect(remainingIds).not.toContain(gId)
    expect(remainingIds).not.toContain(fId)
    expect(remainingIds).not.toContain(sId)

    expect(patch.selectedId).toBeNull()
    expect(patch.messages).toEqual([])
    expect(patch.streaming).toBe(false)
    expect(patch.agents[gId]).toBeUndefined()
    expect(patch.agents[fId]).toBeUndefined()
    expect(patch.childToParent[fId]).toBeUndefined()
    expect(patch.childToParent[sId]).toBeUndefined()
  })
})
