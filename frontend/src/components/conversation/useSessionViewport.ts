import { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStreamStore } from '../../stores/sessionStreamStore'
import type { ScrollMode } from '../../types/sessionStreamTypes'

/** Distance from bottom (px) under which we treat the user as following the tail. */
const NEAR_BOTTOM_THRESHOLD_PX = 80

/**
 * Per-session scroll mode for Turn-Commit Split Surface.
 * Pins follow on session select; transcript scroll promotes free/follow.
 */
export function useSessionViewport(sessionId: string) {
  const { scrollMode, setScrollMode, pinFollowOnSelect } = useSessionStreamStore(
    useShallow((state) => {
      const entry = state.entries[sessionId]
      return {
        scrollMode: (entry?.viewport.scrollMode ?? 'follow') as ScrollMode,
        setScrollMode: state.setScrollMode,
        pinFollowOnSelect: state.pinFollowOnSelect,
      }
    }),
  )

  useEffect(() => {
    pinFollowOnSelect(sessionId)
  }, [sessionId, pinFollowOnSelect])

  const onTranscriptScroll = useCallback(
    (el: HTMLElement) => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom > NEAR_BOTTOM_THRESHOLD_PX) {
        setScrollMode(sessionId, 'free')
      } else {
        setScrollMode(sessionId, 'follow')
      }
    },
    [sessionId, setScrollMode],
  )

  return {
    scrollMode,
    setScrollMode: (mode: ScrollMode) => setScrollMode(sessionId, mode),
    onTranscriptScroll,
  }
}
