import { create } from 'zustand'
import type { ChatMessage, Session, SessionConfig } from '../../bindings/allbeingsfuture/internal/models/models'
import {
  chatCore,
  collectSessionSubtreeIds,
  mergeLoadedSessions,
  type AgentInfo,
  type ParentBinding,
  type ChatUpdateEvent,
  type ChatPatchEvent,
  type AgentUpdateEvent,
  type ChatSnapshot,
} from '../core/chat/chatCore'
import { createAgentStreamBatcher } from '../core/chat/agentStreamBatch'
import {
  convergeAgentStreamOnLegacyEnd,
  createAgentSessionStreamState,
  isAgentStreamActive,
  reduceAgentStreamEvent,
  requestAgentStreamCancellation,
  resolveAgentStreamPermission,
  shouldPreferAgentStream,
} from '../core/chat/agentStreamCore'
import { respondToAgentPermission } from '../hooks/agentStreamIpc'
import type { AgentSessionStreamState, AgentStreamEvent } from '../types/agentStreamTypes'
import { useDraftStore } from './draftStore'
import { commitTurn } from '../core/chat/turnCommit'
import {
  STREAM_SPLIT_SURFACE,
  projectMixedMessages,
  useSessionStreamStore,
} from './sessionStreamStore'

interface SessionState extends ChatSnapshot {
  agentStreams: Record<string, AgentSessionStreamState>
  agentStreamMessages: Record<string, ChatMessage[]>
  loading: boolean
  /** In-flight flush locks so pending queues do not re-enter while a send is running. */
  pendingFlushInFlight: Record<string, boolean>
  load: () => Promise<void>
  create: (config: SessionConfig) => Promise<Session | null>
  select: (id: string | null) => void
  rename: (id: string, name: string) => Promise<void>
  smartRename: (id: string) => Promise<string | null>
  remove: (id: string) => Promise<void>
  end: (id: string) => Promise<void>
  initProcess: (id: string) => Promise<void>
  sendMessage: (id: string, text: string, images?: Array<{data: string, mimeType: string}>) => Promise<void>
  /**
   * Reload transcript from backend for `id`.
   * Pass `{ force: true }` on session switch so UI does not trust a stale
   * agentStreamMessages cache (child agents often finish while unselected).
   */
  pollChat: (id: string, options?: { force?: boolean }) => Promise<void>
  handleChatUpdate: (data: ChatUpdateEvent) => void
  handleChatPatch: (data: ChatPatchEvent) => void
  handleAgentUpdate: (data: AgentUpdateEvent) => void
  handleAgentStreamEvent: (data: AgentStreamEvent) => void
  respondToPermission: (sessionId: string, requestId: string, optionId: string) => Promise<void>
  stopProcess: (id: string) => Promise<void>
  resumeSession: (oldSessionId: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>
  spawnChild: (parentSessionId: string, name: string, prompt: string) => Promise<string | null>
  sendToChild: (parentSessionId: string, childSessionId: string, message: string) => Promise<void>
  /** User closes a persistent child from the sidebar (not auto-on-idle). */
  closeChild: (parentSessionId: string, childSessionId: string) => Promise<void>
  fetchAllAgents: () => Promise<void>
  markWorktreeMerged: (id: string) => Promise<void>
  enterWorktree: (id: string) => Promise<Session | null>
  /** Dispatch the next composer-queued message after a session becomes idle. */
  flushPendingMessages: (sessionId: string) => Promise<void>
}

function snapshotOf(state: SessionState): ChatSnapshot {
  return {
    sessions: state.sessions,
    selectedId: state.selectedId,
    messages: state.messages,
    streaming: state.streaming,
    chatError: state.chatError,
    agents: state.agents,
    childToParent: state.childToParent,
  }
}

/** Bound after store creation so the rAF batcher can reduce with latest get/set. */
let applyAgentStreamBatch: (sessionId: string, events: AgentStreamEvent[]) => void = () => {}

function createStoreAgentStreamBatcher() {
  return createAgentStreamBatcher({
    onFlush: (sessionId, events) => {
      applyAgentStreamBatch(sessionId, events)
    },
  })
}

let agentStreamBatcher = createStoreAgentStreamBatcher()

/**
 * Bumped on local sessions-set mutations (create/remove) so in-flight load()
 * that started with a stale GetAll cannot overwrite newer local state.
 */
let sessionsEpoch = 0

/** Drain pending stream batches (tests / teardown). */
export function flushAgentStreamBatches(sessionId?: string): void {
  agentStreamBatcher.flush(sessionId)
}

/** Drop pending queues and recreate batcher (test isolation). */
export function disposeAgentStreamBatches(): void {
  agentStreamBatcher.dispose()
  agentStreamBatcher = createStoreAgentStreamBatcher()
  // Keep turn-commit store aligned with session store resets in tests.
  if (STREAM_SPLIT_SURFACE) {
    useSessionStreamStore.getState().resetForTests()
  }
}

/** Reset sessions epoch (tests only). */
export function resetSessionsEpochForTests(): void {
  sessionsEpoch = 0
}

export const useSessionStore = create<SessionState>((set, get) => {
  applyAgentStreamBatch = (sessionId, events) => {
    if (events.length === 0) return

    // Reduce inside set() so a concurrent handleChatPatch (user append) that
    // lands mid-batch is visible in `current` and not overwritten.
    let shouldFlushPending = false

    if (STREAM_SPLIT_SURFACE) {
      // Turn-commit split is source of truth; project mixed for old UI.
      const streamStore = useSessionStreamStore.getState()
      // Seed from legacy buffer when this session has never been split-hydrated.
      if (!streamStore.getEntry(sessionId)) {
        const snapshot = get()
        const isSelected = snapshot.selectedId === sessionId
        const seedMessages = snapshot.agentStreamMessages[sessionId]
          || (isSelected ? snapshot.messages : [])
        const seedStream = snapshot.agentStreams[sessionId]
        streamStore.hydrateFromMixed(sessionId, seedMessages, seedStream)
      }
      streamStore.applyBatch(sessionId, events)
      const entry = useSessionStreamStore.getState().getEntry(sessionId)
      if (!entry) return
      const mixed = projectMixedMessages(entry.committed, entry.live)
      const streaming = isAgentStreamActive(entry.stream)
      const error = entry.stream.phase === 'error' ? (entry.stream.terminalReason || '') : ''
      shouldFlushPending = !streaming
      set(current => {
        const isSelected = current.selectedId === sessionId
        return {
          agentStreams: { ...current.agentStreams, [sessionId]: entry.stream },
          agentStreamMessages: { ...current.agentStreamMessages, [sessionId]: mixed },
          sessions: chatCore.syncRuntimeStatus(current.sessions, sessionId, streaming),
          ...(isSelected ? {
            messages: mixed,
            streaming,
            chatError: error,
          } : {}),
        }
      })
    } else {
      set(current => {
        const isSelected = current.selectedId === sessionId
        let currentStream = current.agentStreams[sessionId]
        let messages = current.agentStreamMessages[sessionId] || (isSelected ? current.messages : [])
        let lastApplied: ReturnType<typeof reduceAgentStreamEvent> | null = null

        for (const event of events) {
          const reduction = reduceAgentStreamEvent(messages, currentStream, event)
          if (reduction.ignored) continue
          messages = reduction.messages
          currentStream = reduction.stream
          lastApplied = reduction
        }

        if (!lastApplied) return current

        const applied = lastApplied
        shouldFlushPending = !applied.streaming
        return {
          agentStreams: { ...current.agentStreams, [sessionId]: applied.stream },
          agentStreamMessages: { ...current.agentStreamMessages, [sessionId]: applied.messages },
          sessions: chatCore.syncRuntimeStatus(current.sessions, sessionId, applied.streaming),
          ...(isSelected ? {
            messages: applied.messages,
            streaming: applied.streaming,
            chatError: applied.error,
          } : {}),
        }
      })
    }

    if (shouldFlushPending) {
      void get().flushPendingMessages(sessionId)
    }
  }

  return {
  sessions: [],
  selectedId: null,
  loading: false,
  messages: [],
  streaming: false,
  chatError: '',
  agents: {},
  childToParent: {},
  agentStreams: {},
  agentStreamMessages: {},
  pendingFlushInFlight: {},

  load: async () => {
    const epochAtStart = sessionsEpoch
    set({ loading: true })
    try {
      const incoming = await chatCore.load()
      // Discard stale GetAll if create/remove mutated sessions while we awaited.
      if (epochAtStart !== sessionsEpoch) return
      set(current => ({
        sessions: mergeLoadedSessions(current.sessions, incoming),
      }))
    } finally {
      set({ loading: false })
    }
  },

  create: async (config) => {
    try {
      const result = await chatCore.create(snapshotOf(get()), config)
      if (result.session) {
        const session = result.session
        sessionsEpoch++
        set(current => ({
          sessions: [session, ...current.sessions.filter(s => s.id !== session.id)],
        }))
      }
      return result.session
    } catch (err) {
      console.error('SessionService.Create failed:', err)
      throw err
    }
  },

  select: (id) => {
    const state = get()
    const patch = chatCore.select(snapshotOf(state), id)
    if (!patch) return

    // Snapshot the live transcript before clearing so parent↔child switches
    // do not lose messages that only lived in the selected `messages` array.
    let agentStreamMessages = state.agentStreamMessages
    if (state.selectedId && state.selectedId !== id && state.messages.length > 0) {
      agentStreamMessages = {
        ...agentStreamMessages,
        [state.selectedId]: state.messages,
      }
      // Keep split entry committed/live in sync with the departing selection.
      if (STREAM_SPLIT_SURFACE && state.selectedId) {
        const departing = state.selectedId
        const streamStore = useSessionStreamStore.getState()
        const departingStream = state.agentStreams[departing]
        streamStore.hydrateFromMixed(departing, state.messages, departingStream)
      }
    }

    const stream = id ? state.agentStreams[id] : undefined
    // Optimistic paint from buffer only — force poll below is the source of truth
    // for finished/background children whose cache may lag the process state.
    let bufferedMessages = id ? agentStreamMessages[id] : undefined
    if (STREAM_SPLIT_SURFACE && id) {
      useSessionStreamStore.getState().pinFollowOnSelect(id)
      // Align split entry with dual-write buffer so setState fixtures and
      // background caches paint correctly before force poll settles.
      if (bufferedMessages) {
        useSessionStreamStore.getState().hydrateFromMixed(id, bufferedMessages, stream)
      }
      const entry = useSessionStreamStore.getState().getEntry(id)
      if (entry) {
        bufferedMessages = projectMixedMessages(entry.committed, entry.live)
        agentStreamMessages = {
          ...agentStreamMessages,
          [id]: bufferedMessages,
        }
      }
    }
    set({
      ...patch,
      agentStreamMessages,
      ...(bufferedMessages ? { messages: bufferedMessages } : {}),
      streaming: isAgentStreamActive(stream),
    })
    // Force reload: do not trust stale agentStreamMessages for father/son sessions
    // that streamed while unselected. Grandpa stays correct via the same path.
    if (id) void get().pollChat(id, { force: true })
  },

  rename: async (id, name) => {
    const nextName = name.trim()
    if (!nextName) return
    set(await chatCore.rename(snapshotOf(get()), id, nextName))
  },

  smartRename: async (id) => {
    const result = await chatCore.smartRename(snapshotOf(get()), id)
    if (result.patch) set(result.patch)
    return result.nextName
  },

  remove: async (id) => {
    const before = get()
    const targetIds = collectSessionSubtreeIds(before.sessions, id)
    const snapshot = snapshotOf(before)

    // Optimistic UI: drop subtree immediately so delete never looks stuck while
    // stop/worktree/backend cascade runs (network-bound remote branch cleanup, etc.).
    sessionsEpoch++
    if (STREAM_SPLIT_SURFACE) {
      const streamStore = useSessionStreamStore.getState()
      for (const sessionId of targetIds) {
        streamStore.clearSession(sessionId)
      }
    }
    set(current => {
      const agentStreams = { ...current.agentStreams }
      const agentStreamMessages = { ...current.agentStreamMessages }
      for (const sessionId of targetIds) {
        delete agentStreams[sessionId]
        delete agentStreamMessages[sessionId]
      }
      const nextAgents: typeof current.agents = {}
      for (const [parentKey, list] of Object.entries(current.agents)) {
        if (targetIds.has(parentKey)) continue
        nextAgents[parentKey] = list.filter(
          agent => !targetIds.has(agent.childSessionId) && !targetIds.has(agent.parentSessionId),
        )
      }
      const nextChildToParent: typeof current.childToParent = {}
      for (const [childKey, binding] of Object.entries(current.childToParent)) {
        if (targetIds.has(childKey) || targetIds.has(binding.parentSessionId)) continue
        nextChildToParent[childKey] = binding
      }
      const sessions = current.sessions.filter(session => !targetIds.has(session.id))
      const resetSelection = current.selectedId != null && targetIds.has(current.selectedId)
      return {
        sessions,
        selectedId: resetSelection ? null : current.selectedId,
        agents: nextAgents,
        childToParent: nextChildToParent,
        agentStreams,
        agentStreamMessages,
        ...(resetSelection ? { messages: [], streaming: false, chatError: '' } : {}),
      }
    })

    try {
      await chatCore.remove(snapshot, id)
    } catch (err) {
      // Backend/cleanup failed after optimistic drop — resync so UI matches DB.
      console.error('Session remove failed; reloading sessions:', err)
      try {
        await get().load()
        await get().fetchAllAgents()
      } catch {
        // ignore secondary reload errors
      }
      throw err
    }
  },

  end: async (id) => {
    await chatCore.end(id)
    await get().load()
    // Only drop stream buffers if the session disappeared after end/load.
    set(current => {
      if (current.sessions.some(session => session.id === id)) return current
      if (!(id in current.agentStreams) && !(id in current.agentStreamMessages)) {
        return current
      }
      if (STREAM_SPLIT_SURFACE) {
        useSessionStreamStore.getState().clearSession(id)
      }
      const agentStreams = { ...current.agentStreams }
      const agentStreamMessages = { ...current.agentStreamMessages }
      delete agentStreams[id]
      delete agentStreamMessages[id]
      return { agentStreams, agentStreamMessages }
    })
  },

  initProcess: async (id) => {
    set({ chatError: '' })
    try {
      set(await chatCore.init(snapshotOf(get()), id))
    } catch (err) {
      set(chatCore.buildInitError(err))
      throw err
    }
  },

  sendMessage: async (id, text, images) => {
    set(chatCore.startSend(snapshotOf(get()), id))
    try {
      await chatCore.send(id, text, images)
    } catch (err) {
      set(chatCore.buildSendError(snapshotOf(get()), id, err))
      throw err
    }
  },

  flushPendingMessages: async (sessionId) => {
    const state = get()
    if (state.pendingFlushInFlight[sessionId]) return
    if (isAgentStreamActive(state.agentStreams[sessionId])) return
    if (state.selectedId === sessionId && state.streaming) return

    const pending = useDraftStore.getState().getPending(sessionId)
    if (pending.length === 0) return

    set(current => ({
      pendingFlushInFlight: { ...current.pendingFlushInFlight, [sessionId]: true },
    }))

    const next = useDraftStore.getState().shiftPending(sessionId)
    if (!next) {
      set(current => {
        const { [sessionId]: _, ...rest } = current.pendingFlushInFlight
        return { pendingFlushInFlight: rest }
      })
      return
    }

    try {
      await get().sendMessage(sessionId, next.text, next.images)
    } catch {
      // Put the message back at the front so a later idle event can retry.
      const remaining = useDraftStore.getState().getPending(sessionId)
      useDraftStore.getState().setPending(sessionId, [next, ...remaining])
    } finally {
      set(current => {
        const { [sessionId]: _, ...rest } = current.pendingFlushInFlight
        return { pendingFlushInFlight: rest }
      })
    }
  },

  pollChat: async (id, options) => {
    try {
      const force = options?.force === true
      // Flush pending stream deltas first so a force-select does not race a
      // half-applied agent:stream batch against GetChatState.
      if (force) flushAgentStreamBatches(id)

      // Always poll so a lost agent:stream `done` can still be discovered via
      // legacy streaming:false. Content apply is gated below.
      // Force path bypasses sameMessages short-circuit: session switch must
      // re-hydrate agentStreamMessages even when the optimistic buffer matches
      // an already-stale selected snapshot.
      let polledMessages: ChatMessage[] | undefined
      let polledStreaming: boolean | undefined
      let polledError = ''
      let patch: Partial<ChatSnapshot> | null = null

      if (force) {
        const chatState = await chatCore.pollRaw(id)
        if (!chatState) {
          void get().flushPendingMessages(id)
          return
        }
        polledMessages = chatState.messages ?? []
        polledStreaming = chatState.streaming
        polledError = chatState.error || ''
      } else {
        patch = await chatCore.poll(snapshotOf(get()), id)
        if (!patch) {
          void get().flushPendingMessages(id)
          return
        }
        polledMessages = patch.messages
        polledStreaming = patch.streaming
        polledError = typeof patch.chatError === 'string' ? patch.chatError : ''
      }

      const streamBefore = get().agentStreams[id]
      // Active stream owns the live transcript. Ignore mid-turn snapshots even
      // after long silence — only terminal (streaming:false) may reconcile.
      // Force-select still respects an *active* mid-turn stream (live buffer is
      // newer than a concurrent GetChatState mid-turn snapshot).
      if (shouldPreferAgentStream(streamBefore) && polledStreaming !== false) {
        // Still paint selected view from the live buffer after a switch.
        // Active stream: do not clobber live via poll.
        if (force) {
          set(state => {
            if (state.selectedId !== id) return state
            let live = state.agentStreamMessages[id]
            if (STREAM_SPLIT_SURFACE) {
              const entry = useSessionStreamStore.getState().getEntry(id)
              if (entry) {
                live = projectMixedMessages(entry.committed, entry.live)
              }
            }
            if (!live) return state
            return {
              messages: live,
              streaming: true,
              chatError: '',
            }
          })
        }
        return
      }

      set(state => {
        const stream = state.agentStreams[id]
        const converged = polledStreaming === false
          ? convergeAgentStreamOnLegacyEnd(stream)
          : undefined
        // Prefer explicit polled messages (force) or patch messages (normal).
        const messages = polledMessages
        const isSelected = state.selectedId === id
        // Non-force path may only carry session meta (messages undefined) when
        // the polled session was not selected at poll start — still allow
        // sessions/status updates from patch, but never clobber the *currently*
        // selected transcript with another session's mid-flight poll.
        const next: Partial<SessionState> = {
          ...(patch || {}),
          ...(converged
            ? { agentStreams: { ...state.agentStreams, [id]: converged } }
            : {}),
        }

        if (messages) {
          if (STREAM_SPLIT_SURFACE) {
            const streamStore = useSessionStreamStore.getState()
            const entry = streamStore.getEntry(id)
            const active = isAgentStreamActive(converged || stream)
            if (active) {
              // Settled prefix reload only — keep live intact.
              streamStore.replaceCommitted(id, messages)
            } else {
              streamStore.hydrateFromMixed(id, messages, converged || stream)
            }
            const after = useSessionStreamStore.getState().getEntry(id)
            const projected = after
              ? projectMixedMessages(after.committed, after.live)
              : messages
            next.agentStreamMessages = {
              ...state.agentStreamMessages,
              [id]: projected,
            }
            if (isSelected) {
              next.messages = projected
              if (polledStreaming !== undefined) next.streaming = polledStreaming
              if (force) {
                next.chatError = chatCore.localizeChatError(polledError)
              } else if (patch && 'chatError' in patch) {
                next.chatError = patch.chatError
              }
            } else {
              delete next.messages
              delete next.streaming
              delete next.chatError
            }
          } else {
            next.agentStreamMessages = {
              ...state.agentStreamMessages,
              [id]: messages,
            }
            if (isSelected) {
              next.messages = messages
              if (polledStreaming !== undefined) next.streaming = polledStreaming
              if (force) {
                next.chatError = chatCore.localizeChatError(polledError)
              } else if (patch && 'chatError' in patch) {
                next.chatError = patch.chatError
              }
            } else {
              // Drop selected-view fields that may have been included because the
              // session was selected when the poll *started* but is no longer.
              delete next.messages
              delete next.streaming
              delete next.chatError
            }
          }
        } else if (!isSelected) {
          delete next.messages
          delete next.streaming
          delete next.chatError
        }

        // Force path always refreshes session runtime status from polled streaming.
        if (force && polledStreaming !== undefined) {
          next.sessions = chatCore.syncRuntimeStatus(state.sessions, id, polledStreaming)
        }

        return next
      })
      // flushPendingMessages itself re-checks selected streaming / agent stream activity.
      void get().flushPendingMessages(id)
    } catch (err: unknown) {
      set({ chatError: chatCore.localizeChatError(err instanceof Error ? err.message : String(err)) })
    }
  },

  handleChatUpdate: (data) => {
    const state = get()
    const stream = state.agentStreams[data.sessionId]
    // agent:stream owns live content while the turn is open. Explicit
    // streaming:false is the only legacy path that may replace the transcript.
    if (shouldPreferAgentStream(stream) && data.streaming !== false) return

    const patch = chatCore.applyChatUpdate(snapshotOf(state), data)
    // Final snapshot after turn end — use as-is (no live partial re-stamp).
    const messages = data.messages ?? []
    const converged = data.streaming === false
      ? convergeAgentStreamOnLegacyEnd(stream)
      : undefined
    if (STREAM_SPLIT_SURFACE) {
      // Settled reload of full transcript; clear live when turn ended.
      useSessionStreamStore.getState().hydrateFromMixed(
        data.sessionId,
        messages,
        converged || stream,
      )
    }
    const selectedPatch = patch && state.selectedId === data.sessionId
      ? { ...patch, messages }
      : patch
    set({
      ...(selectedPatch || {}),
      agentStreamMessages: {
        ...state.agentStreamMessages,
        [data.sessionId]: messages,
      },
      ...(converged
        ? { agentStreams: { ...state.agentStreams, [data.sessionId]: converged } }
        : {}),
    })
    if (!data.streaming) {
      void get().flushPendingMessages(data.sessionId)
    }
  },

  handleChatPatch: (data) => {
    const state = get()
    const stream = state.agentStreams[data.sessionId]
    const preferStream = shouldPreferAgentStream(stream)
    const isUserAppend = data.type === 'append' && data.message?.role === 'user'
    const legacyEnded = data.streaming === false

    // Normalized agent:stream owns the live transcript. Exceptions:
    // 1) user turns still arrive via chat:patch (including background sessions)
    // 2) streaming:false terminal reconcile
    // Silence must NEVER re-open mid-turn content from legacy (historical
    // regression: replace stream rows → missing partial/toolUseId → cascade).
    if (preferStream && !isUserAppend && !legacyEnded) {
      const sessions = chatCore.syncRuntimeStatus(state.sessions, data.sessionId, data.streaming)
      if (sessions !== state.sessions) set({ sessions })
      return
    }

    const selected = state.selectedId === data.sessionId
    const baseMessages = selected
      ? state.messages
      : (state.agentStreamMessages[data.sessionId] || [])
    const nextMessages = chatCore.applyMessagePatch(baseMessages, data)
    const sessions = chatCore.syncRuntimeStatus(state.sessions, data.sessionId, data.streaming)
    const converged = legacyEnded ? convergeAgentStreamOnLegacyEnd(stream) : undefined

    let projected = nextMessages
    if (STREAM_SPLIT_SURFACE) {
      const streamForEntry = converged || stream
      const activeStream = isAgentStreamActive(streamForEntry)
      useSessionStreamStore.getState().hydrateFromMixed(
        data.sessionId,
        nextMessages,
        streamForEntry,
      )
      // Only re-project when agent stream owns an active live buffer. Legacy
      // chat patches must keep exact message objects (timestamps / partial).
      if (activeStream) {
        const entry = useSessionStreamStore.getState().getEntry(data.sessionId)
        if (entry) {
          projected = projectMixedMessages(entry.committed, entry.live)
        }
      }
    }

    set({
      sessions,
      agentStreamMessages: {
        ...state.agentStreamMessages,
        [data.sessionId]: projected,
      },
      ...(converged
        ? { agentStreams: { ...state.agentStreams, [data.sessionId]: converged } }
        : {}),
      ...(selected ? {
        messages: projected,
        streaming: data.streaming,
        chatError: chatCore.localizeChatError(data.error || ''),
      } : {}),
    })

    if (!data.streaming) {
      void get().flushPendingMessages(data.sessionId)
    }
  },

  handleAgentUpdate: (data) => {
    const patch = chatCore.applyAgentUpdate(snapshotOf(get()), data)
    if (patch) set(patch)
    // Closed agents must not trigger a full reload that could flash UI state.
    if (data.removed) return
    if (data.agent?.childSessionId && !get().sessions.find(session => session.id === data.agent.childSessionId)) {
      get().load().catch(() => {})
    }
  },

  handleAgentStreamEvent: (data) => {
    // Batch high-frequency deltas to one store set per frame; terminal/tool events flush immediately.
    agentStreamBatcher.push(data)
  },

  respondToPermission: async (sessionId, requestId, optionId) => {
    await respondToAgentPermission({ sessionId, requestId, optionId })
    const state = get()
    const current = state.agentStreams[sessionId]
    const nextStream = resolveAgentStreamPermission(current, requestId)
    if (nextStream === current) return
    if (STREAM_SPLIT_SURFACE) {
      const entry = useSessionStreamStore.getState().getEntry(sessionId)
      if (entry) {
        useSessionStreamStore.setState({
          entries: {
            ...useSessionStreamStore.getState().entries,
            [sessionId]: { ...entry, stream: nextStream },
          },
        })
      }
    }
    set({
      agentStreams: { ...state.agentStreams, [sessionId]: nextStream },
      ...(state.selectedId === sessionId ? { streaming: true } : {}),
    })
  },

  stopProcess: async (id) => {
    const before = get()
    const cancelling = requestAgentStreamCancellation(before.agentStreams[id])
    if (STREAM_SPLIT_SURFACE) {
      const entry = useSessionStreamStore.getState().getEntry(id)
      if (entry) {
        useSessionStreamStore.setState({
          entries: {
            ...useSessionStreamStore.getState().entries,
            [id]: { ...entry, stream: cancelling },
          },
        })
      }
    }
    set({
      agentStreams: { ...before.agentStreams, [id]: cancelling },
      ...(before.selectedId === id ? { streaming: true } : {}),
    })
    try {
      await chatCore.stop(id)
      const state = get()
      const current = state.agentStreams[id] || createAgentSessionStreamState()
      const cancelled = { ...current, phase: 'cancelled' as const, permission: undefined }
      if (STREAM_SPLIT_SURFACE) {
        const entry = useSessionStreamStore.getState().getEntry(id)
        if (entry) {
          // Cancel settles the turn: commit any remaining live buffer.
          const settled = commitTurn(entry.committed, entry.live)
          useSessionStreamStore.setState({
            entries: {
              ...useSessionStreamStore.getState().entries,
              [id]: {
                ...entry,
                stream: cancelled,
                committed: settled.committed,
                live: null,
              },
            },
          })
        }
      }
      set({
        agentStreams: {
          ...state.agentStreams,
          [id]: cancelled,
        },
        sessions: chatCore.syncRuntimeStatus(state.sessions, id, false),
        ...(state.selectedId === id ? { streaming: false } : {}),
      })
      await get().load()
    } catch (err) {
      const state = get()
      const message = err instanceof Error ? err.message : String(err)
      const current = state.agentStreams[id] || createAgentSessionStreamState()
      const errored = {
        ...current,
        phase: 'error' as const,
        terminalReason: message,
        permission: undefined,
      }
      if (STREAM_SPLIT_SURFACE) {
        const entry = useSessionStreamStore.getState().getEntry(id)
        if (entry) {
          const settled = commitTurn(entry.committed, entry.live, message)
          useSessionStreamStore.setState({
            entries: {
              ...useSessionStreamStore.getState().entries,
              [id]: {
                ...entry,
                stream: errored,
                committed: settled.committed,
                live: null,
              },
            },
          })
        }
      }
      set({
        agentStreams: {
          ...state.agentStreams,
          [id]: errored,
        },
        sessions: chatCore.syncRuntimeStatus(state.sessions, id, false),
        ...(state.selectedId === id ? { streaming: false, chatError: message } : {}),
      })
      throw err
    }
  },

  resumeSession: async (oldSessionId) => {
    try {
      const result = await chatCore.resume(oldSessionId)
      if (result?.success) {
        await get().load()
        set({ selectedId: result.sessionId ?? null })
        return result
      }
      return result || { success: false, error: 'Resume failed' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  spawnChild: async (parentSessionId, name, prompt) => {
    try {
      const result = await chatCore.spawnChild(parentSessionId, name, prompt)
      if (result?.childSessionId) {
        await get().load()
        await get().fetchAllAgents()
        return result.childSessionId
      }
      return null
    } catch (err) {
      console.error('SpawnChildSession failed:', err)
      return null
    }
  },

  sendToChild: async (parentSessionId, childSessionId, message) => {
    await chatCore.sendToChild(parentSessionId, childSessionId, message)
  },

  closeChild: async (parentSessionId, childSessionId) => {
    // Optimistic drop so sidebar clears immediately even if event races
    const optimistic = chatCore.applyAgentUpdate(snapshotOf(get()), {
      parentSessionId,
      removed: true,
      agent: {
        agentId: `persistent-${childSessionId}`,
        name: '',
        parentSessionId,
        childSessionId,
        status: 'cancelled',
        workDir: '',
        createdAt: '',
        completedAt: new Date().toISOString(),
      },
    })
    if (optimistic) set(optimistic)
    try {
      await chatCore.closeChild(parentSessionId, childSessionId)
    } catch (err) {
      console.error('CloseChildSession failed:', err)
      // Recover list if backend close failed
      await get().fetchAllAgents()
      throw err
    }
  },

  fetchAllAgents: async () => {
    try {
      const patch = await chatCore.fetchAllAgents(snapshotOf(get()))
      if (patch) set(patch)
    } catch (err) {
      console.warn('fetchAllAgents failed:', err)
    }
  },

  markWorktreeMerged: async (id) => {
    await chatCore.markWorktreeMerged(id)
    await get().load()
  },

  enterWorktree: async (id) => {
    try {
      const result = await chatCore.enterWorktree(snapshotOf(get()), id)
      if (result.patch) set(result.patch)
      // 工作目录变更后重新初始化，使 Agent 进程切到 worktree
      try {
        await get().initProcess(id)
      } catch (err) {
        console.warn('enterWorktree: re-init after workdir change failed:', err)
      }
      return result.session
    } catch (err) {
      console.error('enterWorktree failed:', err)
      throw err
    }
  },
  }
})

export type {
  AgentInfo,
  ParentBinding,
  ChatUpdateEvent,
  ChatPatchEvent,
  AgentUpdateEvent,
}
