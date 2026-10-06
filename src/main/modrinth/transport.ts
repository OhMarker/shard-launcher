import { type ZodType } from 'zod'
import { ShardError } from '@shared/errors'
import { createLogger } from '../logger'
import { toNetworkError } from '../net/http'
import { RateLimiter, resetDelayMs } from './rate-limit'

const log = createLogger('modrinth')

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>
/** Arrays are sent JSON-encoded, the way Modrinth expects `loaders=["fabric"]`. */
export type QueryValue = string | number | boolean | string[]
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>

export interface ModrinthTransportOptions {
  baseUrl: string
  userAgent: string | (() => string)
  fetchFn?: FetchFn
  limiter?: RateLimiter
  timeoutMs?: number
  sleep?: SleepFn
}

export interface RequestOptions {
  query?: Record<string, QueryValue>
  signal?: AbortSignal
}

const MAX_429_RETRIES = 1
const MAX_5XX_RETRIES = 1

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ShardError('CANCELLED', 'Cancelled'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new ShardError('CANCELLED', 'Cancelled'))
      },
      { once: true }
    )
  })
}

/**
 * HTTP layer for the Modrinth API: User-Agent, JSON, rate limiting, one retry on 429 (after
 * the reported reset), 404 -> NOT_FOUND, and Zod validation of every response body.
 * `fetchFn` is injectable so tests can run without a network.
 */
export class ModrinthTransport {
  readonly limiter: RateLimiter
  private readonly baseUrl: string
  private readonly userAgent: () => string
  private readonly fetchFn: FetchFn
  private readonly timeoutMs: number
  private readonly sleep: SleepFn

  constructor(options: ModrinthTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    const userAgent = options.userAgent
    this.userAgent = typeof userAgent === 'string' ? () => userAgent : userAgent
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init))
    this.limiter = options.limiter ?? new RateLimiter()
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.sleep = options.sleep ?? defaultSleep
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
      }
    }
    return url.toString()
  }

  get<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
    return this.request(path, { method: 'GET' }, schema, options)
  }

  post<T>(path: string, body: unknown, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
    return this.request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      schema,
      options
    )
  }

  private async request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
    schema: ZodType<T>,
    options: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options.query)
    let rateLimitRetries = 0
    let serverErrorRetries = 0
    for (;;) {
      const res = await this.send(url, init, options.signal)
      this.limiter.observe(res.headers)

      if (res.status === 429) {
        const delay = resetDelayMs(res.headers)
        if (rateLimitRetries < MAX_429_RETRIES) {
          rateLimitRetries++
          log.warn(`429 from Modrinth for ${path}; retrying in ${delay}ms`)
          this.limiter.pauseFor(delay)
          await this.sleep(delay, options.signal)
          continue
        }
        throw new ShardError('RATE_LIMITED', 'Modrinth is rate limiting requests. Try again in a minute.', {
          details: { url, retryAfterMs: delay }
        })
      }
      if (res.status === 404) {
        throw new ShardError('NOT_FOUND', `Modrinth has nothing at ${path}`, { details: { url } })
      }
      if (res.status >= 500 && serverErrorRetries < MAX_5XX_RETRIES) {
        serverErrorRetries++
        log.warn(`${res.status} from Modrinth for ${path}; retrying`)
        await this.sleep(750, options.signal)
        continue
      }
      const text = await res.text()
      if (!res.ok) {
        throw new ShardError('HTTP', `HTTP ${res.status} from Modrinth`, {
          details: { status: res.status, url, body: text.slice(0, 2000) }
        })
      }
      return this.parse(text, schema, url)
    }
  }

  private async send(
    url: string,
    init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
    signal?: AbortSignal
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    return this.limiter.run(async () => {
      try {
        return await this.fetchFn(url, {
          method: init.method,
          headers: {
            'User-Agent': this.userAgent(),
            Accept: 'application/json',
            ...init.headers
          },
          body: init.body,
          signal: combined,
          redirect: 'follow'
        })
      } catch (err) {
        throw toNetworkError(err, url)
      }
    }, signal)
  }

  private parse<T>(text: string, schema: ZodType<T>, url: string): T {
    let data: unknown
    try {
      data = text.length ? JSON.parse(text) : null
    } catch (err) {
      throw new ShardError('MANIFEST_INVALID', 'Modrinth returned invalid JSON', { cause: err, details: { url } })
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      log.error(`Unexpected Modrinth response shape for ${url}`, parsed.error.issues.slice(0, 5))
      throw new ShardError('MANIFEST_INVALID', 'Modrinth returned an unexpected response', {
        details: { url, issues: parsed.error.issues.slice(0, 10) }
      })
    }
    return parsed.data
  }
}
