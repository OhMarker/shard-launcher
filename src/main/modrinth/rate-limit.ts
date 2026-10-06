import { MODRINTH_RATE_LIMIT_PER_MINUTE } from '@shared/constants'
import { ShardError } from '@shared/errors'

/** Modrinth allows 300/min; we stay under it so bursts from other tooling do not tip us over. */
export const DEFAULT_REQUEST_BUDGET_PER_MINUTE = MODRINTH_RATE_LIMIT_PER_MINUTE - 20
export const DEFAULT_CONCURRENCY = 6
const WINDOW_MS = 60_000

export interface RateLimiterOptions {
  /** Maximum requests started within any rolling minute. */
  limitPerMinute?: number
  /** Maximum requests in flight at once. */
  concurrency?: number
  /** Clock, injectable for tests. */
  now?: () => number
}

/** The subset of `Headers` the limiter reads. */
export interface HeaderReader {
  get(name: string): string | null
}

interface Waiter {
  resolve: () => void
  reject: (err: Error) => void
  signal: AbortSignal | undefined
  onAbort: () => void
}

function cancelled(): ShardError {
  return new ShardError('CANCELLED', 'Cancelled')
}

/** Numeric header value, or null when the header is absent or not a number (`Number(null)` is 0). */
export function numericHeader(headers: HeaderReader, name: string): number | null {
  const raw = headers.get(name)
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Milliseconds until the server's rate-limit window resets, read from `Retry-After` or
 * `X-Ratelimit-Reset` (both in seconds). Falls back to a full window.
 */
export function resetDelayMs(headers: HeaderReader, fallbackMs = WINDOW_MS): number {
  const retryAfter = numericHeader(headers, 'retry-after')
  if (retryAfter !== null && retryAfter > 0) return retryAfter * 1000
  const reset = numericHeader(headers, 'x-ratelimit-reset')
  if (reset !== null && reset > 0) return reset * 1000
  return fallbackMs
}

/**
 * Sliding-window request queue: at most `limitPerMinute` requests start within any rolling
 * minute, at most `concurrency` run at once, and the whole queue pauses when the server
 * reports an exhausted budget (`X-Ratelimit-Remaining: 0`) until the reported reset.
 */
export class RateLimiter {
  readonly limitPerMinute: number
  readonly concurrency: number
  private readonly now: () => number
  private readonly starts: number[] = []
  private readonly waiters: Waiter[] = []
  private active = 0
  private pausedUntilMs = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: RateLimiterOptions = {}) {
    this.limitPerMinute = Math.max(1, options.limitPerMinute ?? DEFAULT_REQUEST_BUDGET_PER_MINUTE)
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
    this.now = options.now ?? Date.now
  }

  /** Epoch ms until which no request may start, or 0 when not paused. */
  get pausedUntil(): number {
    return this.pausedUntilMs > this.now() ? this.pausedUntilMs : 0
  }

  get inFlight(): number {
    return this.active
  }

  get queued(): number {
    return this.waiters.length
  }

  /** Runs `fn` once a slot is available and releases the slot when it settles. */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  acquire(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(cancelled())
        return
      }
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const i = this.waiters.indexOf(waiter)
          if (i >= 0) {
            this.waiters.splice(i, 1)
            reject(cancelled())
          }
        }
      }
      signal?.addEventListener('abort', waiter.onAbort, { once: true })
      this.waiters.push(waiter)
      this.pump()
    })
  }

  release(): void {
    if (this.active > 0) this.active--
    this.pump()
  }

  /** Reads Modrinth's rate-limit headers and pauses the queue when the budget is exhausted. */
  observe(headers: HeaderReader): void {
    const remaining = numericHeader(headers, 'x-ratelimit-remaining')
    if (remaining === null || remaining > 0) return
    this.pauseFor(resetDelayMs(headers))
  }

  pauseFor(ms: number): void {
    const until = this.now() + Math.max(0, ms)
    if (until > this.pausedUntilMs) this.pausedUntilMs = until
    this.pump()
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS
    while (this.starts.length > 0 && (this.starts[0] ?? now) <= cutoff) this.starts.shift()
  }

  private delayUntilSlot(now: number): number {
    let delay = Math.max(0, this.pausedUntilMs - now)
    if (this.starts.length >= this.limitPerMinute) {
      const oldest = this.starts[0] ?? now
      delay = Math.max(delay, oldest + WINDOW_MS - now)
    }
    return delay
  }

  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    while (this.waiters.length > 0 && this.active < this.concurrency) {
      const now = this.now()
      this.prune(now)
      const delay = this.delayUntilSlot(now)
      if (delay > 0) {
        this.timer = setTimeout(() => {
          this.timer = null
          this.pump()
        }, delay)
        return
      }
      const waiter = this.waiters.shift()
      if (!waiter) return
      waiter.signal?.removeEventListener('abort', waiter.onAbort)
      this.active++
      this.starts.push(now)
      waiter.resolve()
    }
  }
}
