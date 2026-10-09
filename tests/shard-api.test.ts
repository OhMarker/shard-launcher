import { createPublicKey, generateKeyPairSync, verify as verifySignature } from 'node:crypto'
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

const me = { uuid: UUID, name: 'OhMarkerr', tokens: 1200, owned: [], cape: null, admin: false, role: null, inGame: false, secondsToNextTokens: 420 }

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

// A stand-in for Mojang's /player/certificates answer, with a real key pair.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_DER = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const pem = (label: string, b64: string): string =>
  [`-----BEGIN ${label}-----`, ...(b64.match(/.{1,64}/g) ?? []), `-----END ${label}-----`].join('\n')
const CERT = {
  keyPair: {
    privateKey: pem('RSA PRIVATE KEY', PRIVATE_DER),
    publicKey: pem('RSA PUBLIC KEY', keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'))
  },
  publicKeySignature: 'v1-unused',
  publicKeySignatureV2: 'bW9qYW5nLXNpZ25hdHVyZQ==',
  expiresAt: '2099-01-01T00:00:00.000Z',
  refreshedAfter: '2098-12-31T00:00:00.000Z'
}

const baseRoutes = (): Record<string, (call: Call) => Response> => ({
  [`GET ${SERVICES}`]: () => json({ api: API }),
  [`POST ${API}/v1/auth/challenge`]: () => json({ serverId: SERVER_ID }),
  ['POST https://api.minecraftservices.com/player/certificates']: () => json(CERT),
  [`POST ${API}/v1/auth/verify`]: () => json({ session: 'shard-session-1', me }),
  [`GET ${API}/v1/me`]: () => json(me),
  [`GET ${API}/v1/shop`]: () => json({ items: [{ id: 'cape-ohmarker', price: 1000 }] })
})

describe('Shard API service', () => {
  it('signs in through Mojang and never sends the Minecraft token to Shard', async () => {
    const calls = stubFetch(baseRoutes())
    const state = await createShardApiService(context()).state()
    expect(state).toEqual({ status: 'ready', me, shop: [{ id: 'cape-ohmarker', price: 1000 }] })

    const cert = calls.find((c) => c.url.includes('api.minecraftservices.com/player/certificates'))
    expect(cert?.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    const verify = calls.find((c) => c.url.endsWith('/v1/auth/verify'))
    const body = JSON.parse(verify?.body ?? '{}')
    expect(body).toMatchObject({ username: 'OhMarkerr', serverId: SERVER_ID })
    expect(body.proof).toMatchObject({ uuid: UUID, keySignature: CERT.publicKeySignatureV2, expiresAt: Date.parse(CERT.expiresAt) })
    // The challenge is signed with the account's own key, which the API can check with the public half.
    const publicKey = createPublicKey({ key: Buffer.from(body.proof.publicKey, 'base64'), format: 'der', type: 'spki' })
    expect(verifySignature('sha256', Buffer.from(`shard-auth:${SERVER_ID}`), publicKey, Buffer.from(body.proof.signature, 'base64'))).toBe(true)
    // Neither the access token nor the private key ever goes to Shard.
    for (const c of calls.filter((x) => !x.url.includes('api.minecraftservices.com'))) {
      expect(JSON.stringify(c)).not.toContain(ACCESS_TOKEN)
      expect(JSON.stringify(c)).not.toContain(PRIVATE_DER.slice(40, 120))
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

  it('lists staff and sets roles through the admin endpoints', async () => {
    const mod = { uuid: 'c'.repeat(32), name: 'Bob', tokens: 5, owned: [], cape: null, admin: false, role: 'mod', lastSeen: null }
    const calls = stubFetch({
      ...baseRoutes(),
      [`GET ${API}/v1/admin/staff`]: () => json({ staff: [{ ...mod }, { ...mod, uuid: UUID, name: 'OhMarkerr', admin: true, role: 'owner' }] }),
      [`POST ${API}/v1/admin/role`]: () => json({ ...mod, role: null })
    })
    const api = createShardApiService(context())
    const staff = await api.adminStaff()
    expect(staff.map((p) => p.role)).toEqual(['mod', 'owner'])
    await expect(api.adminRole('Bob', null)).resolves.toMatchObject({ name: 'Bob', role: null })
    const roleCall = calls.find((c) => c.url === `${API}/v1/admin/role`)
    expect(JSON.parse(roleCall?.body ?? '{}')).toEqual({ player: 'Bob', role: null })
    expect(roleCall?.headers.authorization ?? roleCall?.headers.Authorization).toBe('Bearer shard-session-1')
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
