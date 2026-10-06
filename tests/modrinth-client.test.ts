import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShardError } from '@shared/errors'
import { ModrinthApi, buildSearchFacets } from '@main/modrinth/client'
import { RateLimiter, resetDelayMs } from '@main/modrinth/rate-limit'
import { ModrinthTransport, type FetchFn } from '@main/modrinth/transport'

const BASE = 'https://api.modrinth.com/v2'

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers }
  })
}

interface Call {
  url: URL
  init: RequestInit
}

function makeApi(responder: (call: Call, n: number) => Response | Promise<Response>, limiter = new RateLimiter()) {
  const calls: Call[] = []
  const fetchFn: FetchFn = async (url, init) => {
    const call = { url: new URL(url), init }
    calls.push(call)
    return responder(call, calls.length)
  }
  const transport = new ModrinthTransport({
    baseUrl: BASE,
    userAgent: 'shard-test/1.0 (test)',
    fetchFn,
    limiter,
    sleep: async () => undefined
  })
  return { api: new ModrinthApi(transport), calls }
}

const versionPayload = {
  game_versions: ['1.21.4'],
  loaders: ['fabric'],
  id: 'c3YkZvne',
  project_id: 'AANobbMI',
  author_id: 'TEZXhE2U',
  featured: false,
  name: 'Sodium 0.6.13 for Fabric 1.21.4',
  version_number: 'mc1.21.4-0.6.13-fabric',
  changelog: '- Fixes',
  changelog_url: null,
  date_published: '2025-04-04T00:09:49.666331Z',
  downloads: 5530306,
  version_type: 'release',
  status: 'listed',
  requested_status: null,
  files: [
    {
      hashes: {
        sha512: '2C72CA2DDFD27E29FF6C24FCCDF6F3D80857BD1014C707017F96CB4A424F94918E53BA21D85F22E3C9171803F8D2C12C99AE857D38D8E85546CC65960B95A2F1'
      },
      url: 'https://cdn.modrinth.com/data/AANobbMI/versions/c3YkZvne/sodium-fabric-0.6.13%2Bmc1.21.4.jar',
      filename: 'sodium-fabric-0.6.13+mc1.21.4.jar',
      primary: true,
      size: 1306799,
      file_type: null
    }
  ],
  dependencies: [
    { version_id: null, project_id: 'P7dR8mSH', file_name: null, dependency_type: 'required' },
    { dependency_type: 'optional' }
  ]
}

const searchPayload = {
  hits: [
    {
      project_id: 'AANobbMI',
      project_type: 'mod',
      slug: 'sodium',
      author: 'jellysquid3',
      title: 'Sodium',
      description: 'A rendering engine',
      categories: ['fabric', 'optimization'],
      display_categories: ['optimization'],
      versions: ['1.21.4'],
      downloads: 10,
      follows: 2,
      icon_url: '',
      date_created: '2021-01-03T00:53:34Z',
      date_modified: '2026-09-20T21:27:06Z',
      latest_version: 'c3YkZvne',
      license: 'LGPL-3.0-only',
      client_side: 'required',
      server_side: 'unsupported',
      gallery: [],
      featured_gallery: null,
      color: 8703084
    }
  ],
  offset: 20,
  limit: 10,
  total_hits: 34
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ModrinthApi.search', () => {
  it('sends Fabric/mod/version facets, paging and the User-Agent', async () => {
    const { api, calls } = makeApi(() => json(searchPayload))
    const result = await api.search({
      query: 'sodium',
      gameVersion: '1.21.4',
      index: 'downloads',
      offset: 20,
      limit: 10,
      categories: ['optimization']
    })

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.url.pathname).toBe('/v2/search')
    expect(call?.url.searchParams.get('query')).toBe('sodium')
    expect(call?.url.searchParams.get('index')).toBe('downloads')
    expect(call?.url.searchParams.get('offset')).toBe('20')
    expect(call?.url.searchParams.get('limit')).toBe('10')
    expect(JSON.parse(call?.url.searchParams.get('facets') ?? '')).toEqual([
      ['project_type:mod'],
      ['categories:fabric'],
      ['versions:1.21.4'],
      ['categories:optimization']
    ])
    const headers = call?.init.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('shard-test/1.0 (test)')
    expect(headers.Accept).toBe('application/json')

    expect(result.totalHits).toBe(34)
    expect(result.offset).toBe(20)
    expect(result.hits[0]).toMatchObject({
      projectId: 'AANobbMI',
      slug: 'sodium',
      iconUrl: null,
      displayCategories: ['optimization'],
      latestVersion: 'c3YkZvne',
      clientSide: 'required'
    })
  })

  it('builds facets without categories', () => {
    expect(buildSearchFacets('1.21')).toEqual([['project_type:mod'], ['categories:fabric'], ['versions:1.21']])
  })
})

describe('ModrinthApi mapping', () => {
  it('maps a version payload to the domain shape', async () => {
    const { api, calls } = makeApi(() => json(versionPayload))
    const version = await api.getVersion('c3YkZvne')
    expect(calls[0]?.url.pathname).toBe('/v2/version/c3YkZvne')
    expect(version).toMatchObject({
      id: 'c3YkZvne',
      projectId: 'AANobbMI',
      versionNumber: 'mc1.21.4-0.6.13-fabric',
      versionType: 'release',
      gameVersions: ['1.21.4'],
      loaders: ['fabric'],
      changelog: '- Fixes'
    })
    expect(version.files[0]).toEqual({
      url: versionPayload.files[0]?.url,
      filename: 'sodium-fabric-0.6.13+mc1.21.4.jar',
      primary: true,
      size: 1306799,
      sha512: versionPayload.files[0]?.hashes.sha512.toLowerCase(),
      sha1: null
    })
    expect(version.dependencies).toEqual([
      { versionId: null, projectId: 'P7dR8mSH', fileName: null, dependencyType: 'required' },
      { versionId: null, projectId: null, fileName: null, dependencyType: 'optional' }
    ])
  })

  it('encodes loaders and game versions as JSON arrays', async () => {
    const { api, calls } = makeApi(() => json([versionPayload]))
    const versions = await api.getVersions('sodium', { gameVersion: '1.21.4', loaders: ['fabric'] })
    expect(versions).toHaveLength(1)
    expect(calls[0]?.url.pathname).toBe('/v2/project/sodium/version')
    expect(calls[0]?.url.searchParams.get('loaders')).toBe('["fabric"]')
    expect(calls[0]?.url.searchParams.get('game_versions')).toBe('["1.21.4"]')
  })

  it('maps 404 to NOT_FOUND', async () => {
    const { api } = makeApi(() => new Response('', { status: 404 }))
    await expect(api.getProject('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects payloads that fail the schema', async () => {
    const { api } = makeApi(() => json({ id: 1 }))
    await expect(api.getProject('sodium')).rejects.toMatchObject({ code: 'MANIFEST_INVALID' })
  })

  it('caches hash lookups and posts sha512 batches', async () => {
    const hash = versionPayload.files[0]?.hashes.sha512.toLowerCase() ?? ''
    const { api, calls } = makeApi(() => json({ [hash]: versionPayload }))
    const first = await api.getVersionsByHashes([hash.toUpperCase(), 'f'.repeat(128)])
    expect(first[hash]?.id).toBe('c3YkZvne')
    expect(calls[0]?.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ hashes: [hash, 'f'.repeat(128)], algorithm: 'sha512' })

    const second = await api.getVersionsByHashes([hash])
    expect(second[hash]?.id).toBe('c3YkZvne')
    expect(calls).toHaveLength(1)
  })
})

describe('rate limiting', () => {
  it('pauses the queue when the server reports no remaining budget and resumes after reset', async () => {
    vi.useFakeTimers()
    const { api, calls } = makeApi((_call, n) =>
      json(versionPayload, {
        headers:
          n === 1 ? { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '5' } : { 'x-ratelimit-remaining': '299' }
      })
    )

    await api.getVersion('first')
    expect(calls).toHaveLength(1)

    const second = api.getVersion('second')
    await vi.advanceTimersByTimeAsync(4000)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(calls).toHaveLength(2)
    await expect(second).resolves.toMatchObject({ id: 'c3YkZvne' })
  })

  it('never starts more than the per-minute budget inside a rolling minute', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter({ limitPerMinute: 3, concurrency: 6 })
    const { api, calls } = makeApi(() => json(versionPayload), limiter)

    const pending = Array.from({ length: 5 }, (_, i) => api.getVersion(`v${i}`))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(59_000)
    expect(calls).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(calls).toHaveLength(5)
    await Promise.all(pending)
  })

  it('caps in-flight requests at the configured concurrency', async () => {
    const limiter = new RateLimiter({ limitPerMinute: 280, concurrency: 2 })
    let inFlight = 0
    let peak = 0
    const { api } = makeApi(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return json(versionPayload)
    }, limiter)
    await Promise.all(Array.from({ length: 6 }, (_, i) => api.getVersion(`v${i}`)))
    expect(peak).toBe(2)
  })

  it('retries once after a 429, waiting for Retry-After, and then gives up with RATE_LIMITED', async () => {
    vi.useFakeTimers()
    const { api, calls } = makeApi((_call, n) =>
      n === 1 ? json({ error: 'ratelimit' }, { status: 429, headers: { 'retry-after': '1' } }) : json(versionPayload)
    )
    const first = api.getVersion('x')
    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(calls).toHaveLength(2)
    await expect(first).resolves.toMatchObject({ id: 'c3YkZvne' })

    const always = makeApi(() => json({ error: 'ratelimit' }, { status: 429, headers: { 'x-ratelimit-reset': '30' } }))
    const failing = always.api.getVersion('x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(31_000)
    const err = await failing
    expect(err).toBeInstanceOf(ShardError)
    expect((err as ShardError).code).toBe('RATE_LIMITED')
    expect(always.calls).toHaveLength(2)
  })

  it('does not pause when rate-limit headers are missing', () => {
    const limiter = new RateLimiter()
    limiter.observe(new Headers({ 'content-type': 'application/json' }))
    expect(limiter.pausedUntil).toBe(0)
    limiter.observe(new Headers({ 'x-ratelimit-remaining': '12' }))
    expect(limiter.pausedUntil).toBe(0)
    limiter.observe(new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '7' }))
    expect(limiter.pausedUntil).toBeGreaterThan(Date.now() + 6000)
  })

  it('reads reset delays from Retry-After or X-Ratelimit-Reset', () => {
    expect(resetDelayMs(new Headers({ 'retry-after': '2' }))).toBe(2000)
    expect(resetDelayMs(new Headers({ 'x-ratelimit-reset': '45' }))).toBe(45_000)
    expect(resetDelayMs(new Headers({ 'x-ratelimit-reset': '0' }))).toBe(60_000)
    expect(resetDelayMs(new Headers({ 'retry-after': 'soon' }))).toBe(60_000)
    expect(resetDelayMs(new Headers(), 1234)).toBe(1234)
  })
})
