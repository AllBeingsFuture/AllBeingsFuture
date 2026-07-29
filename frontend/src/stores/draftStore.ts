import { create } from 'zustand'

interface ImageAttachment {
  data: string
  mimeType: string
  preview: string
}

interface FileAttachment {
  name: string
  path: string
  size: string
  mimeType: string
  isImage: boolean
  isDirectory?: boolean
}

interface Draft {
  text: string
  images: ImageAttachment[]
  files: FileAttachment[]
}

/** Messages queued while a session is still streaming. Keyed by sessionId so
 *  switching parent↔child does not drop unsent turns with the unmounted composer. */
export interface PendingMessage {
  text: string
  images?: Array<{ data: string; mimeType: string }>
}

interface DraftState {
  drafts: Record<string, Draft>
  pendingBySession: Record<string, PendingMessage[]>
  saveDraft: (sessionId: string, draft: Draft) => void
  getDraft: (sessionId: string) => Draft | undefined
  clearDraft: (sessionId: string) => void
  getPending: (sessionId: string) => PendingMessage[]
  enqueuePending: (sessionId: string, message: PendingMessage) => void
  setPending: (sessionId: string, messages: PendingMessage[]) => void
  removePendingAt: (sessionId: string, index: number) => void
  clearPending: (sessionId: string) => void
  /** Remove and return the first pending message, or undefined if empty. */
  shiftPending: (sessionId: string) => PendingMessage | undefined
}

const EMPTY: Draft = { text: '', images: [], files: [] }

export type { ImageAttachment, FileAttachment, Draft }

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: {},
  pendingBySession: {},

  saveDraft: (sessionId, draft) => {
    // Only save if there's actual content
    if (!draft.text && draft.images.length === 0 && draft.files.length === 0) {
      // Remove empty draft
      set(s => {
        const { [sessionId]: _, ...rest } = s.drafts
        return { drafts: rest }
      })
      return
    }
    set(s => ({ drafts: { ...s.drafts, [sessionId]: draft } }))
  },

  getDraft: (sessionId) => get().drafts[sessionId],

  clearDraft: (sessionId) => {
    set(s => {
      const { [sessionId]: _, ...rest } = s.drafts
      return { drafts: rest }
    })
  },

  getPending: (sessionId) => get().pendingBySession[sessionId] || [],

  enqueuePending: (sessionId, message) => {
    set(s => ({
      pendingBySession: {
        ...s.pendingBySession,
        [sessionId]: [...(s.pendingBySession[sessionId] || []), message],
      },
    }))
  },

  setPending: (sessionId, messages) => {
    set(s => {
      if (messages.length === 0) {
        const { [sessionId]: _, ...rest } = s.pendingBySession
        return { pendingBySession: rest }
      }
      return {
        pendingBySession: {
          ...s.pendingBySession,
          [sessionId]: messages,
        },
      }
    })
  },

  removePendingAt: (sessionId, index) => {
    set(s => {
      const current = s.pendingBySession[sessionId] || []
      if (index < 0 || index >= current.length) return s
      const next = current.filter((_, i) => i !== index)
      if (next.length === 0) {
        const { [sessionId]: _, ...rest } = s.pendingBySession
        return { pendingBySession: rest }
      }
      return {
        pendingBySession: {
          ...s.pendingBySession,
          [sessionId]: next,
        },
      }
    })
  },

  clearPending: (sessionId) => {
    set(s => {
      const { [sessionId]: _, ...rest } = s.pendingBySession
      return { pendingBySession: rest }
    })
  },

  shiftPending: (sessionId) => {
    const current = get().pendingBySession[sessionId] || []
    if (current.length === 0) return undefined
    const [first, ...rest] = current
    get().setPending(sessionId, rest)
    return first
  },
}))
