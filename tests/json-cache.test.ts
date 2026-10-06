import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { JsonCache } from '@main/util/json-cache'

const schema = z.object({ latest: z.string(), count: z.number() })
let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shard-cache-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})
afterEach(() => vi.unstubAllGlobals())

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

describe('JsonCache', () => {
  it('fetches, validates, caches and revalidates with ETag', async () => {
    const cache = new JsonCache(dir)
    const url = 'https://example.com/manifest.json'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ latest: '1.0', count: 1 }, 200, { etag: '"abc"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await cache.fetch(url, schema)
    expect(first.source).toBe('remote')
    expect(first.data).toEqual({ latest: '1.0', count: 1 })

    const second = await cache.fetch(url, schema)
    expect(second.source).toBe('remote')
    expect(second.data).toEqual({ latest: '1.0', count: 1 })
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect((secondInit.headers as Record<string, string>)['If-None-Match']).toBe('"abc"')
  })

  it('serves the cache within maxAge without touching the network', async () => {
    const cache = new JsonCache(dir)
    const url = 'https://example.com/fresh.json'
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ latest: '2.0', count: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    await cache.fetch(url, schema)
    const again = await cache.fetch(url, schema, { maxAgeMs: 60_000 })
    expect(again.source).toBe('cache')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the cached copy when offline', async () => {
    const cache = new JsonCache(dir)
    const url = 'https://example.com/offline.json'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ latest: '3.0', count: 3 })))
    await cache.fetch(url, schema)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))
    )
    const result = await cache.fetch(url, schema)
    expect(result.source).toBe('cache')
    expect(result.data.latest).toBe('3.0')
  })

  it('throws when offline with no cache and never caches invalid payloads', async () => {
    const cache = new JsonCache(dir)
    const url = 'https://example.com/invalid.json'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ latest: 5 })))
    await expect(cache.fetch(url, schema)).rejects.toMatchObject({ code: 'MANIFEST_INVALID' })
    expect(await cache.read(url, schema)).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('x', { status: 404 })))
    await expect(cache.fetch(url, schema)).rejects.toMatchObject({ code: 'HTTP' })
  })
})
