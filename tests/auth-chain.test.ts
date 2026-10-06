import { describe, expect, it, vi } from 'vitest'
import { URLS } from '@shared/constants'
import { ShardError, type ShardErrorCode } from '@shared/errors'
import { type LoginStage } from '@shared/types'
import {
  MINECRAFT_RELYING_PARTY,
  runChain,
  XBOX_RELYING_PARTY,
  xblToXsts,
  type FetchFn
} from '@main/auth/chain'

const XBL = URLS.xblAuth
const XSTS = URLS.xstsAuth
const MC_LOGIN = `${URLS.minecraftServices}/authentication/login_with_xbox`
const ENTITLEMENTS = `${URLS.minecraftServices}/entitlements/mcstore`
const PROFILE = `${URLS.minecraftServices}/minecraft/profile`

type Route = (init: RequestInit) => Response
type Call = { url: string; init: RequestInit }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function body(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name)
}

function mockFetch(routes: Record<string, Route>): { fetchFn: FetchFn; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn = vi.fn(async (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const resolved = init ?? {}
    calls.push({ url, init: resolved })
    const route = routes[url]
    if (!route) throw new Error(`Unexpected request to ${url}`)
    return route(resolved)
  })
  return { fetchFn, calls }
}

async function expectCode(promise: Promise<unknown>, code: ShardErrorCode): Promise<ShardError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(ShardError)
    expect((err as ShardError).code).toBe(code)
    return err as ShardError
  }
  throw new Error(`Expected rejection with ${code}`)
}

const xblRoute: Route = () =>
  json({
    IssueInstant: '2026-10-06T00:00:00Z',
    NotAfter: '2026-10-07T00:00:00Z',
    Token: 'xbl-token',
    DisplayClaims: { xui: [{ uhs: 'hash123' }] }
  })

const xstsRoute: Route = (init) =>
  body(init).RelyingParty === MINECRAFT_RELYING_PARTY
    ? json({ Token: 'xsts-game', DisplayClaims: { xui: [{ uhs: 'hash123' }] } })
    : json({ Token: 'xsts-xbox', DisplayClaims: { xui: [{ uhs: 'hash123', xid: '2535400000000000' }] } })

const mcLoginRoute: Route = () =>
  json({ username: 'uuid', roles: [], access_token: 'mc-token', token_type: 'Bearer', expires_in: 86400 })

const entitlementsRoute =
  (items: Array<{ name: string }>): Route =>
  () =>
    json({ items, signature: 'sig', keyId: '1' })

const profileRoute: Route = () =>
  json({
    id: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
    name: 'Notch',
    skins: [{ id: 'skin-1', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/abc', variant: 'SLIM' }],
    capes: [{ id: 'cape-1', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/cape', alias: 'Migrator' }]
  })

const noProfileRoute: Route = () =>
  json({ path: '/minecraft/profile', errorType: 'NOT_FOUND', error: 'NOT_FOUND', errorMessage: 'Not found' }, 404)

describe('runChain', () => {
  it('walks xbl -> xsts -> minecraft -> entitlements -> profile and returns a session', async () => {
    const { fetchFn, calls } = mockFetch({
      [XBL]: xblRoute,
      [XSTS]: xstsRoute,
      [MC_LOGIN]: mcLoginRoute,
      [ENTITLEMENTS]: entitlementsRoute([{ name: 'product_minecraft' }, { name: 'game_minecraft' }]),
      [PROFILE]: profileRoute
    })
    const stages: LoginStage[] = []
    const before = Date.now()
    const result = await runChain('ms-token', { fetchFn, onStage: (s) => stages.push(s), userAgent: 'ShardTest/1.0' })

    expect(stages).toEqual(['xbox', 'xsts', 'minecraft', 'entitlements', 'profile', 'done'])
    expect(calls.map((c) => c.url)).toEqual([XBL, XSTS, XSTS, MC_LOGIN, ENTITLEMENTS, PROFILE])

    const xbl = calls[0]!
    expect(xbl.init.method).toBe('POST')
    expect(header(xbl.init, 'Accept')).toBe('application/json')
    expect(header(xbl.init, 'Content-Type')).toBe('application/json')
    expect(header(xbl.init, 'User-Agent')).toBe('ShardTest/1.0')
    expect(body(xbl.init)).toEqual({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=ms-token' },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })

    const relyingParties = [calls[1]!, calls[2]!].map((c) => body(c.init).RelyingParty)
    expect(relyingParties).toEqual([MINECRAFT_RELYING_PARTY, XBOX_RELYING_PARTY])
    expect(body(calls[1]!.init)).toEqual({
      Properties: { SandboxId: 'RETAIL', UserTokens: ['xbl-token'] },
      RelyingParty: MINECRAFT_RELYING_PARTY,
      TokenType: 'JWT'
    })

    expect(body(calls[3]!.init)).toEqual({ identityToken: 'XBL3.0 x=hash123;xsts-game' })
    expect(calls[4]!.init.method).toBe('GET')
    expect(header(calls[4]!.init, 'Authorization')).toBe('Bearer mc-token')
    expect(header(calls[5]!.init, 'Authorization')).toBe('Bearer mc-token')

    expect(result.mcAccessToken).toBe('mc-token')
    expect(result.xuid).toBe('2535400000000000')
    const expires = Date.parse(result.mcExpiresAt)
    expect(expires).toBeGreaterThanOrEqual(before + 86400 * 1000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 86400 * 1000)
    expect(result.profile).toEqual({
      id: '069a79f444e94726a5befca90e38aaf5',
      name: 'Notch',
      skins: [
        {
          id: 'skin-1',
          state: 'ACTIVE',
          url: 'http://textures.minecraft.net/texture/abc',
          variant: 'SLIM',
          textureKey: null
        }
      ],
      capes: [{ id: 'cape-1', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/cape', alias: 'Migrator' }]
    })
  })

  it('accepts Game Pass accounts (profile exists, entitlements empty)', async () => {
    const { fetchFn } = mockFetch({
      [XBL]: xblRoute,
      [XSTS]: xstsRoute,
      [MC_LOGIN]: mcLoginRoute,
      [ENTITLEMENTS]: entitlementsRoute([]),
      [PROFILE]: profileRoute
    })
    const result = await runChain('ms-token', { fetchFn })
    expect(result.profile.name).toBe('Notch')
  })

  it('reports AUTH_NO_PROFILE when the game is owned but no Java profile exists', async () => {
    const { fetchFn } = mockFetch({
      [XBL]: xblRoute,
      [XSTS]: xstsRoute,
      [MC_LOGIN]: mcLoginRoute,
      [ENTITLEMENTS]: entitlementsRoute([{ name: 'game_minecraft' }]),
      [PROFILE]: noProfileRoute
    })
    const err = await expectCode(runChain('ms-token', { fetchFn }), 'AUTH_NO_PROFILE')
    expect(err.message).toContain('minecraft.net')
  })

  it('reports AUTH_NO_GAME when neither a profile nor an entitlement exists', async () => {
    const { fetchFn } = mockFetch({
      [XBL]: xblRoute,
      [XSTS]: xstsRoute,
      [MC_LOGIN]: mcLoginRoute,
      [ENTITLEMENTS]: entitlementsRoute([{ name: 'product_dungeons' }]),
      [PROFILE]: noProfileRoute
    })
    await expectCode(runChain('ms-token', { fetchFn }), 'AUTH_NO_GAME')
  })

  it('treats the XUID lookup as best-effort', async () => {
    const { fetchFn } = mockFetch({
      [XBL]: xblRoute,
      [XSTS]: (init) =>
        body(init).RelyingParty === MINECRAFT_RELYING_PARTY
          ? json({ Token: 'xsts-game', DisplayClaims: { xui: [{ uhs: 'hash123' }] } })
          : json({ message: 'boom' }, 500),
      [MC_LOGIN]: mcLoginRoute,
      [ENTITLEMENTS]: entitlementsRoute([]),
      [PROFILE]: profileRoute
    })
    const result = await runChain('ms-token', { fetchFn })
    expect(result.xuid).toBe('')
  })

  it('maps transient upstream failures to HTTP rather than an auth failure', async () => {
    const { fetchFn } = mockFetch({ [XBL]: () => json({ message: 'maintenance' }, 503) })
    await expectCode(runChain('ms-token', { fetchFn }), 'HTTP')
  })
})

describe('xblToXsts error mapping', () => {
  const cases: Array<[number, ShardErrorCode]> = [
    [2148916227, 'AUTH_BANNED'],
    [2148916233, 'AUTH_NO_XBOX_PROFILE'],
    [2148916235, 'AUTH_REGION_BLOCKED'],
    [2148916236, 'AUTH_ADULT_VERIFICATION'],
    [2148916237, 'AUTH_ADULT_VERIFICATION'],
    [2148916238, 'AUTH_CHILD_ACCOUNT']
  ]

  for (const [xerr, code] of cases) {
    it(`maps XErr ${xerr} to ${code}`, async () => {
      const { fetchFn } = mockFetch({
        [XSTS]: () => json({ Identity: '0', XErr: xerr, Message: '', Redirect: 'https://start.ui.xboxlive.com' }, 401)
      })
      await expectCode(xblToXsts('xbl-token', MINECRAFT_RELYING_PARTY, { fetchFn }), code)
    })
  }

  it('includes unknown XErr numbers in an AUTH_FAILED message', async () => {
    const { fetchFn } = mockFetch({ [XSTS]: () => json({ XErr: 2148916999 }, 401) })
    const err = await expectCode(xblToXsts('xbl-token', MINECRAFT_RELYING_PARTY, { fetchFn }), 'AUTH_FAILED')
    expect(err.message).toContain('2148916999')
  })

  it('falls back to AUTH_FAILED when the 401 body is not JSON', async () => {
    const { fetchFn } = mockFetch({ [XSTS]: () => new Response('nope', { status: 401 }) })
    await expectCode(xblToXsts('xbl-token', MINECRAFT_RELYING_PARTY, { fetchFn }), 'AUTH_FAILED')
  })
})
