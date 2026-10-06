import { useCallback, useEffect, useRef, useState } from 'react'
import { type ModsProgress } from '@shared/types'
import { useIpcEvent } from '@/lib/api'

/** Progress of a finished job stays visible briefly; a stalled one disappears after a while. */
const DONE_LINGER_MS = 1500
const STALE_AFTER_MS = 10_000

/**
 * Follows `mods:progress` events for one instance. Returns the latest progress line and a
 * function to clear it (call it when the mutation that produced the events settles).
 */
export function useModsProgress(instanceId: string | null): [ModsProgress | null, () => void] {
  const [progress, setProgress] = useState<ModsProgress | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setProgress(null)
  }, [])

  useIpcEvent('mods:progress', (p) => {
    if (p.instanceId !== instanceId) return
    setProgress(p)
    if (timer.current) clearTimeout(timer.current)
    const done = p.total > 0 && p.current >= p.total
    timer.current = setTimeout(() => setProgress(null), done ? DONE_LINGER_MS : STALE_AFTER_MS)
  })

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return [progress && progress.instanceId === instanceId ? progress : null, clear]
}
