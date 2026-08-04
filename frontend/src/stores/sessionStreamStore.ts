import { create } from 'zustand'
import type { ChatMessage } from '../../bindings/allbeingsfuture/internal/models/models'
import {
  createAgentSessionStreamState,
  isAgentStreamActive,
  reduceAgentStreamEvent,
} from '../core/chat/agentStreamCore'
import {
  commitTurn,
  emptyLiveBuffer,
  materializeLive,
  projectMixedMessages,
  reduceLive,
  splitMessagesToCommittedAndLive,
} from '../core/chat/turnCommit'
import type { AgentStreamEvent } from '../types/agentStreamTypes'
import type {
  ScrollMode,
  SessionStreamEntry,
} from '../types/sessionStreamTypes'

function createEmptyEntry(): SessionStreamEntry {
  return {
    stream: createAgentSessionStreamState(),
    committed: [],
    live: null,
    viewport: { scrollMode: 'follow' },
  }
}

interface SessionStreamState {
  entries: Record<string, SessionStreamEntry>
  applyBatch: (sessionId: string, events: AgentStreamEvent[]) => void
  ensureEntry: (sessionId: string) => SessionStreamEntry
  getEntry: (sessionId: string) => SessionStreamEntry | undefined
  setScrollMode: (sessionId: string, mode: ScrollMode) => void
  pinFollowOnSelect: (sessionId: string) => void
  replaceCommitted: (sessionId: string, messages: ChatMessage[]) => void
  hydrateFromMixed: (
    sessionId: string,
    messages: ChatMessage[],
    stream?: SessionStreamEntry['stream'],
  ) => void
  clearSession: (sessionId: string) => void
  /** Test helper: wipe all entries. */
  resetForTests: () => void
}

export const useSessionStreamStore = create<SessionStreamState>((set, get) => ({
  entries: {},

  ensureEntry: (sessionId) => {
    const existing = get().entries[sessionId]
    if (existing) return existing
    const entry = createEmptyEntry()
    set(state => ({
      entries: { ...state.entries, [sessionId]: entry },
    }))
    return entry
  },

  getEntry: (sessionId) => get().entries[sessionId],

  applyBatch: (sessionId, events) => {
    if (events.length === 0) return

    set(state => {
      const prev = state.entries[sessionId] ?? createEmptyEntry()
      let committed = prev.committed
      let live = prev.live
      let stream = prev.stream
      const viewport = prev.viewport

      for (const event of events) {
        // Sequence / phase via existing reduce on mixed projection so we do not
        // fork lastSequence or plan/permission handling.
        const mixed = projectMixedMessages(committed, live)
        const reduction = reduceAgentStreamEvent(mixed, stream, event)
        if (reduction.ignored) continue

        stream = reduction.stream

        if (!reduction.streaming) {
          // Terminal (done / error / cancelled / status idle): commit live once.
          const error = reduction.error || undefined
          // Prefer commitTurn from frozen committed + live so open tools never
          // leaked into committed mid-turn. Fall back to reduction.messages when
          // live was empty (phase-only terminal or hydrate edge).
          if (live) {
            const result = commitTurn(committed, live, error)
            committed = result.committed
            live = null
          } else {
            committed = reduction.messages
            live = null
          }
          continue
        }

        // Active turn: freeze committed; content only mutates live.
        live = reduceLive(live, event)
        if (live === null && isAgentStreamActive(stream)) {
          live = emptyLiveBuffer()
        }
      }

      return {
        entries: {
          ...state.entries,
          [sessionId]: { stream, committed, live, viewport },
        },
      }
    })
  },

  setScrollMode: (sessionId, mode) => {
    set(state => {
      const prev = state.entries[sessionId] ?? createEmptyEntry()
      if (prev.viewport.scrollMode === mode) {
        if (state.entries[sessionId]) return state
      }
      return {
        entries: {
          ...state.entries,
          [sessionId]: {
            ...prev,
            viewport: { ...prev.viewport, scrollMode: mode },
          },
        },
      }
    })
  },

  pinFollowOnSelect: (sessionId) => {
    get().setScrollMode(sessionId, 'follow')
  },

  replaceCommitted: (sessionId, messages) => {
    set(state => {
      const prev = state.entries[sessionId] ?? createEmptyEntry()
      // Settled reload must not clobber an active live buffer.
      const keepLive = isAgentStreamActive(prev.stream) ? prev.live : null
      return {
        entries: {
          ...state.entries,
          [sessionId]: {
            ...prev,
            committed: messages,
            live: keepLive,
          },
        },
      }
    })
  },

  hydrateFromMixed: (sessionId, messages, stream) => {
    set(state => {
      const prev = state.entries[sessionId] ?? createEmptyEntry()
      const nextStream = stream ?? prev.stream
      const active = isAgentStreamActive(nextStream)
      const split = splitMessagesToCommittedAndLive(messages, active)
      return {
        entries: {
          ...state.entries,
          [sessionId]: {
            ...prev,
            stream: nextStream,
            committed: split.committed,
            // When inactive, always clear live even if prev had a stale buffer.
            live: active ? split.live : null,
            viewport: prev.viewport,
          },
        },
      }
    })
  },

  clearSession: (sessionId) => {
    set(state => {
      if (!(sessionId in state.entries)) return state
      const { [sessionId]: _, ...rest } = state.entries
      return { entries: rest }
    })
  },

  resetForTests: () => set({ entries: {} }),
}))

export { materializeLive, projectMixedMessages, emptyLiveBuffer }
