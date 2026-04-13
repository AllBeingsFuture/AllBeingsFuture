import { useCallback, useState } from 'react'

export function useGroupCollapsed(storageKey: string) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  const isCollapsed = useCallback(
    (key: string, hasRunning: boolean) => {
      if (key in state) {
        return state[key]
      }
      return !hasRunning
    },
    [state],
  )

  const toggle = useCallback(
    (key: string, hasRunning: boolean) => {
      setState((previous) => {
        const nextValue = !(key in previous ? previous[key] : !hasRunning)
        const next = { ...previous, [key]: nextValue }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // ignore persistence failures
        }
        return next
      })
    },
    [storageKey],
  )

  return { isCollapsed, toggle }
}
