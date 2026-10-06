import { type ZodType } from 'zod'
import { ShardError, type ShardErrorCode } from '@shared/errors'
import { APP_NAME } from '@shared/constants'
import { createLogger } from '../logger'

const log = createLogger('http')

let userAgent = `${APP_NAME}/0.0.0`

export function setDefaultUserAgent(ua: string): void {
  userAgent = ua
}

export function getDefaultUserAgent(): string {
  return userAgent
}

export class HttpError extends ShardError {
  readonly status: number
  readonly body: string
  readonly url: string

  constructor(url: string, status: number, body: string, code: ShardErrorCode = 'HTTP') {
    super(code, `HTTP ${status} from ${new URL(url).host}`, {
      details: { status, url, body: body.slice(0, 2000) }
    })
    this.name = 'HttpError'
    this.status = status
    this.body = body
    this.url = url
  }

  json(): unknown {
    try {
      return JSON.parse(this.body)
    } catch {
      return null
    }
  }
}

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string | Buffer | FormData | URLSearchParams
  timeoutMs?: number
  /** Retries for network failures and 5xx/429. Default 2. */
  retries?: number
  signal?: AbortSignal
  /** Status codes that should not throw. */
  allowStatus?: number[]
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ShardError('CANCELLED', 'Cancelled'))
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

function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([timeout, signal]) : timeout
}

export function toNetworkError(err: unknown, url: string): ShardError {
  if (err instanceof ShardError) return err
  const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string } }
  const cause = e.cause?.code ?? e.code ?? e.cause?.name ?? e.name
  if (cause === 'TimeoutError' || cause === 'UND_ERR_CONNECT_TIMEOUT' || cause === 'UND_ERR_HEADERS_TIMEOUT') {
    return new ShardError('TIMEOUT', `Timed out talking to ${new URL(url).host}`, { cause: err })
  }
  if (cause === 'AbortError') return new ShardError('CANCELLED', 'Cancelled', { cause: err })
  if (
    cause === 'ENOTFOUND' ||
    cause === 'EAI_AGAIN' ||
    cause === 'ECONNREFUSED' ||
    cause === 'ECONNRESET' ||
    cause === 'ENETUNREACH' ||
    cause === 'EHOSTUNREACH' ||
    cause === 'UND_ERR_SOCKET'
  ) {
    return new ShardError('OFFLINE', `Could not reach ${new URL(url).host}`, { cause: err })
  }
  return new ShardError('HTTP', `Request to ${new URL(url).host} failed`, { cause: err })
}

/** fetch with timeout, retry/backoff and a stable User-Agent. Throws HttpError for non-2xx. */
export async function httpRequest(url: string, options: HttpOptions = {}): Promise<Response> {
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 30_000
  let attempt = 0
  for (;;) {
    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers: { 'User-Agent': userAgent, ...options.headers },
        body: options.body,
        signal: combineSignals(timeoutMs, options.signal),
        redirect: 'follow'
      })
      if (res.ok || options.allowStatus?.includes(res.status)) return res
      const body = await res.text().catch(() => '')
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt)
        log.warn(`${res.status} from ${url}, retrying in ${delay}ms`)
        await sleep(delay, options.signal)
        attempt++
        continue
      }
      throw new HttpError(url, res.status, body, res.status === 429 ? 'RATE_LIMITED' : 'HTTP')
    } catch (err) {
      if (err instanceof HttpError) throw err
      const mapped = toNetworkError(err, url)
      if (mapped.code === 'CANCELLED' || attempt >= retries) throw mapped
      if (mapped.code === 'TIMEOUT' || mapped.code === 'OFFLINE' || mapped.code === 'HTTP') {
        const delay = backoff(attempt)
        log.warn(`${mapped.code} for ${url}, retrying in ${delay}ms`)
        await sleep(delay, options.signal)
        attempt++
        continue
      }
      throw mapped
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
}

export async function httpJson<T>(url: string, schema: ZodType<T>, options: HttpOptions = {}): Promise<T> {
  const res = await httpRequest(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers }
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text.length ? JSON.parse(text) : null
  } catch (err) {
    throw new ShardError('MANIFEST_INVALID', `Invalid JSON from ${new URL(url).host}`, { cause: err })
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    log.error(`Schema mismatch for ${url}`, parsed.error.issues.slice(0, 5))
    throw new ShardError('MANIFEST_INVALID', `Unexpected response shape from ${new URL(url).host}`, {
      details: parsed.error.issues.slice(0, 10)
    })
  }
  return parsed.data
}

export async function httpText(url: string, options: HttpOptions = {}): Promise<string> {
  const res = await httpRequest(url, options)
  return res.text()
}

export async function httpBuffer(url: string, options: HttpOptions = {}): Promise<Buffer> {
  const res = await httpRequest(url, options)
  return Buffer.from(await res.arrayBuffer())
}

export function postJson<T>(url: string, body: unknown, schema: ZodType<T>, options: HttpOptions = {}): Promise<T> {
  return httpJson(url, schema, {
    ...options,
    method: options.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(body)
  })
}

export function postForm<T>(
  url: string,
  form: Record<string, string>,
  schema: ZodType<T>,
  options: HttpOptions = {}
): Promise<T> {
  return httpJson(url, schema, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...options.headers },
    body: new URLSearchParams(form)
  })
}
