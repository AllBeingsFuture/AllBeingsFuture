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

interface DraftState {
  drafts: Record<string, Draft>
  saveDraft: (sessionId: string, draft: Draft) => void
  getDraft: (sessionId: string) => Draft | undefined
  clearDraft: (sessionId: string) => void
}

const EMPTY: Draft = { text: '', images: [], files: [] }

export type { ImageAttachment, FileAttachment, Draft }

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: {},

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
}))
