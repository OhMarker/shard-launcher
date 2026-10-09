import { useEffect, useState } from 'react'

/** The current time, refreshed every `intervalMs` (for "expires in 3 days" and live/expired states). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
