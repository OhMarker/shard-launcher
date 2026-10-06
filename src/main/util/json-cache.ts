import { join } from 'node:path'
import { type ZodType } from 'zod'
import { CacheEnvelopeSchema } from '@shared/schemas/storage'
import { ShardError } from '@shared/errors'
import { createLogger } from '../logger'
import { httpRequest } from '../net/http'
import { hashBuffer, readJsonOrNull, writeJson } from './fs'

const log = createLogger('cache')

export interface CachedFetchResult<T> {
  data: T
  source: 'remote' | 'cache'
  fetchedAt: string
}

export interface CachedFetchOptions {
  /** Serve the cache without hitting the network when younger than this. 0 = always revalidate. */
  maxAgeMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  timeoutMs?: number
}

/**
 * Remote JSON with an on-disk cache for offline use. Validates the payload with Zod before
 * caching, uses ETags for cheap revalidation, and falls back to the cached copy when the
 * network fails.
 */
export class JsonCache {
  constructor(private readonly cacheDir: string) {}

  private fileFor(url: string): string {
    return join(this.cacheDir, `${hashBuffer(url, 'sha1').slice(0, 24)}.json`)
  }

  async read<T>(url: string, schema: ZodType<T>): Promise<{ data: T; fetchedAt: string; etag: string | null } | null> {
    const envelope = await readJsonOrNull(this.fileFor(url), CacheEnvelopeSchema)
    if (!envelope) return null
    const parsed = schema.safeParse(envelope.data)
    if (!parsed.success) {
      log.warn(`Cached payload for ${url} no longer validates; ignoring`)
      return null
    }
    return { data: parsed.data, fetchedAt: envelope.fetchedAt, etag: envelope.etag }
  }

  async write(url: string, data: unknown, etag: string | null): Promise<void> {
    await writeJson(this.fileFor(url), {
      fetchedAt: new Date().toISOString(),
      etag,
      url,
      data
    })
  }

  async fetch<T>(url: string, schema: ZodType<T>, options: CachedFetchOptions = {}): Promise<CachedFetchResult<T>> {
    const cached = await this.read(url, schema)
    const maxAge = options.maxAgeMs ?? 0
    if (cached && maxAge > 0 && Date.now() - Date.parse(cached.fetchedAt) < maxAge) {
      return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt }
    }

    try {
      const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
      if (cached?.etag) headers['If-None-Match'] = cached.etag
      const res = await httpRequest(url, {
        headers,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? 20_000,
        retries: 1,
        allowStatus: [304]
      })
      if (res.status === 304 && cached) {
        await this.write(url, cached.data, cached.etag)
        return { data: cached.data, source: 'remote', fetchedAt: new Date().toISOString() }
      }
      const text = await res.text()
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch (err) {
        throw new ShardError('MANIFEST_INVALID', `Invalid JSON from ${new URL(url).host}`, { cause: err })
      }
      const parsed = schema.safeParse(json)
      if (!parsed.success) {
        throw new ShardError('MANIFEST_INVALID', `Unexpected shape from ${new URL(url).host}`, {
          details: parsed.error.issues.slice(0, 10)
        })
      }
      const etag = res.headers.get('etag')
      await this.write(url, parsed.data, etag)
      return { data: parsed.data, source: 'remote', fetchedAt: new Date().toISOString() }
    } catch (err) {
      if (cached) {
        const e = ShardError.from(err)
        log.warn(`Using cached ${url} (${e.code}: ${e.message})`)
        return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt }
      }
      throw err
    }
  }
}
