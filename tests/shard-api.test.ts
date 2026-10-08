import { mkdtempSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type AppContext, type GameSession } from '@main/context'
import { createShardApiService } from '@main/shard-api/shard-api'

vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('@main/ipc/router', () => ({ handle: vi.fn() }))

const API = 'https://api.shard.example'
const SERVICES = 'https://meta.example/services.json'
const UUID = '4a5e875e479a43f1bfc16c6bd326643d'
const ACCESS_TOKEN = 'minecraft-access-token-secret'
const SERVER_ID = 'ab'.repeat(16)

const me = { uuid: UUID, name: 'OhMarkerr', tokens: 1200, owned: [], cape: null, admin: false, inGame: false, secondsToNextTokens: 420 }

let dir = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shard-api-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function context(opts: { signedIn?: boolean; isPackaged?: boolean } = {}): AppContext {
  const session: GameSession = {
    accountId: UUID,
    username: 'OhMarkerr',
    uuid: UUID,
    accessToken: ACCESS_TOKEN,
    xuid: '',
    userType: 'msa',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString()
  }
  const active = opts.signedIn === false ? null : { id: UUID, username: 'OhMarkerr' }
  return {
    // A fresh cache per service: JsonCache would otherwise serve an earlier test's services.json.
    paths: { cache: mkdtempSync(join(dir, 'cache-')) },
    isPackaged: opts.isPackaged ?? true,
    manifestUrls: () => ({ shard: '', bundledMods: '', cosmetics: '', services: SERVICES }),
    services: {
      accounts: {
        getActive: () => active,
        getSession: vi.fn(async () => session)
      }
    }
  } as unknown as AppContext
}

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

/** Routes fetch by "METHOD url"; records every request. */
function stubFetch(routes: Record<string, (call: Call) => Response>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body as string | undefined
      }
      calls.push(call)
      const route = routes[`${call.method} ${url}`]
      if (!route) return json({ error: 'Not found' }, 404)
      return route(call)
    })
  )
  return calls
}

const baseRoutes = (): Record<string, (call: Call) => Response> => ({
  [`GET ${SERVICES}`]: () => json({ api: API }),
  [`POST ${API}/v1/auth/challenge`]: () => json({ serverId: SERVER_ID }),
  ['POST https://sessionserver.mojang.com/session/minecraft/join']: () => new Response(null, { status: 204 }),
  [`POST ${API}/v1/auth/verify`]: () => json({ session: 'shard-session-1', me }),
  [`GET ${API}/v1/me`]: () => json(me),
  [`GET ${API}/v1/shop`]: () => json({ items: [{ id: 'cape-ohmarker', price: 1000 }] })
})

describe('Shard API service', () => {
  it('signs in through Mojang and never sends the Minecraft token to Shard', async () => {
    const calls = stubFetch(baseRoutes())
    const state = await createShardApiService(context()).state()
    expect(state).toEqual({ status: 'ready', me, shop: [{ id: 'cape-ohmarker', price: 1000 }] })

    const join = calls.find((c) => c.url.includes('sessionserver.mojang.com'))
    expect(JSON.parse(join?.body ?? '{}')).toEqual({ accessToken: ACCESS_TOKEN, selectedProfile: UUID, serverId: SERVER_ID })
    const verify = calls.find((c) => c.url.endsWith('/v1/auth/verify'))
    expect(JSON.parse(verify?.body ?? '{}')).toEqual({ username: 'OhMarkerr', serverId: SERVER_ID })
    for (const c of calls.filter((x) => !x.url.includes('sessionserver.mojang.com'))) {
      expect(JSON.stringify(c)).not.toContain(ACCESS_TOKEN)
    }
    expect(calls.find((c) => c.url.endsWith('/v1/me'))?.headers.Authorization).toBe('Bearer shard-session-1')
  })

  it('signs in again once when the session is rejected', async () => {
    let meCalls = 0
    let verifies = 0
    const calls = stubFetch({
      ...baseRoutes(),
      [`POST ${API}/v1/auth/verify`]: () => json({ session: `shard-session-${++verifies}`, me }),
      [`GET ${API}/v1/me`]: () => (++meCalls === 1 ? json({ error: 'Sign in to Shard first' }, 401) : json(me))
    })
    const api = createShardApiService(context())
    await expect(api.me()).resolves.toEqual(me)
    expect(verifies).toBe(2)
    const meRequests = calls.filter((c) => c.url.endsWith('/v1/me'))
    expect(meRequests.map((c) => c.headers.Authorization)).toEqual(['Bearer shard-session-1', 'Bearer shard-session-2'])
  })

  it('maps API errors to ShardErrors with the API message', async () => {
    stubFetch({
      ...baseRoutes(),
      [`POST ${API}/v1/buy`]: () => json({ error: 'You need 300 more tokens' }, 402)
    })
    await expect(createShardApiService(context()).buy('cape-ohmarker')).rejects.toMatchObject({
      code: 'SHARD_API',
      message: 'You need 300 more tokens'
    })
  })

  it('reports "unavailable" when services.json is missing, and "signed-out" without an account', async () => {
    stubFetch({ ...baseRoutes(), [`GET ${SERVICES}`]: () => json({ error: 'nope' }, 404) })
    const state = await createShardApiService(context()).state()
    expect(state).toEqual({ status: 'unavailable', message: 'Shard online features are not available yet' })

    stubFetch(baseRoutes())
    expect(await createShardApiService(context({ signedIn: false })).state({ refresh: true })).toEqual({
      status: 'signed-out',
      shop: [{ id: 'cape-ohmarker', price: 1000 }]
    })
  })

  it('refuses an http API address from services.json', async () => {
    stubFetch({ ...baseRoutes(), [`GET ${SERVICES}`]: () => json({ api: 'http://api.shard.example' }) })
    const state = await createShardApiService(context()).state({ refresh: true })
    expect(state.status).toBe('unavailable')
  })

  it('development sign-in skips Mojang only in unpackaged builds', async () => {
    vi.stubEnv('SHARD_API_URL', 'http://127.0.0.1:8787')
    vi.stubEnv('SHARD_API_DEV_AUTH', '1')
    vi.stubEnv('SHARD_DEV_FAKE_ACCOUNT', `ShardDev:${'c'.repeat(32)}`)
    const local = 'http://127.0.0.1:8787'
    const calls = stubFetch({
      [`POST ${local}/v1/auth/challenge`]: () => json({ serverId: SERVER_ID }),
      [`POST ${local}/v1/auth/verify`]: () => json({ session: 's', me: { ...me, uuid: 'c'.repeat(32), name: 'ShardDev' } }),
      [`GET ${local}/v1/me`]: () => json({ ...me, uuid: 'c'.repeat(32), name: 'ShardDev' })
    })
    const dev = await createShardApiService(context({ signedIn: false, isPackaged: false })).me()
    expect(dev.name).toBe('ShardDev')
    expect(calls.some((c) => c.url.includes('mojang'))).toBe(false)
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/verify'))?.body ?? '{}').devUuid).toBe('c'.repeat(32))

    // Packaged: the fake account and plain-http override are ignored entirely.
    const packaged = await createShardApiService(context({ signedIn: false, isPackaged: true })).state()
    expect(packaged.status).toBe('unavailable')
  })
})
