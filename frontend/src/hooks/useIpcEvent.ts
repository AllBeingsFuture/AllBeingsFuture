import { useEffect, useRef } from 'react'

/**
 * React hook that subscribes to an Electron IPC event from the main process.
 * Automatically cleans up the listener on unmount or when the event name changes.
 *
 * @param eventName - The IPC channel name to listen for.
 * @param callback  - Handler receiving the event data payload.
 */
export function useIpcEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const cleanup = window.electronAPI.on(eventName, (...args: any[]) => {
      callbackRef.current(args.length === 1 ? args[0] : args as any)
    })
    return cleanup
  }, [eventName])
}
