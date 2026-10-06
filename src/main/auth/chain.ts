/**
 * Microsoft access token -> Xbox Live -> XSTS -> Minecraft services. Pure functions with an
 * injected fetch so the whole chain can be unit-tested without Electron or the network. This
 * file must not import `electron` or anything that does (logger, net/http).
 */
import { type ZodType } from 'zod'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { uuidWithoutDashes } from '@shared/format'
import {
  EntitlementsResponseSchema,
  MinecraftLoginResponseSchema,
  MinecraftProfileResponseSchema,
  MinecraftServicesErrorSchema,
  XboxTokenResponseSchema,
  XstsErrorResponseSchema,
  type MinecraftProfileResponse
} from '@shared/schemas/auth'
import { type LoginStage, type MinecraftProfile } from '@shared/types'

export type FetchFn = typeof globalThis.fetch

export interface RequestOptions {
  fetchFn?: FetchFn
  userAgent?: string
  signal?: AbortSignal
}

export interface ChainOptions extends RequestOptions {
  onStage?: (stage: LoginStage) => void
}

export interface ChainResult {
  profile: MinecraftProfile
  mcAccessToken: string
  mcExpiresAt: string
  /** Xbox user id, or '' when the XSTS display claims did not include one. */
  xuid: string
}

export interface XstsResult {
  token: string
  uhs: string
  xid: string | null
}

export const LOGIN_STAGE_LABELS: Record<LoginStage, string> = {
  microsoft: 'Signing in with Microsoft',
  xbox: 'Signing in to Xbox Live',
  xsts: 'Authorizing with Xbox Live',
  minecraft: 'Signing in to Minecraft',
  entitlements: 'Checking game ownership',
  profile: 'Loading your profile',
  done: 'Signed in'
}

/** Relying party for the token Minecraft services accept. */
export const MINECRAFT_RELYING_PARTY = 'rp://api.minecraftservices.com/'
/** Relying party whose display claims include the XUID. */
export const XBOX_RELYING_PARTY = 'http://xboxlive.com'

const OWNERSHIP_ITEMS: ReadonlySet<string> = new Set(['product_minecraft', 'game_minecraft'])
const OFFLINE_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET'
])
const REQUEST_TIMEOUT_MS = 30_000

interface RawResponse {
  status: number
  text: string
}

function networkError(err: unknown, url: string): ShardError {
  if (err instanceof ShardError) return err
  const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string } }
  const cause = e.cause?.code ?? e.code ?? e.cause?.name ?? e.name ?? ''
  const host = new URL(url).host
  if (cause === 'TimeoutError' || cause === 'UND_ERR_CONNECT_TIMEOUT' || cause === 'UND_ERR_HEADERS_TIMEOUT') {
    return new ShardError('TIMEOUT', `Timed out talking to ${host}`, { cause: err })
  }
  if (cause === 'AbortError') return new ShardError('CANCELLED', 'Cancelled', { cause: err })
  if (OFFLINE_CODES.has(cause)) return new ShardError('OFFLINE', `Could not reach ${host}`, { cause: err })
  return new ShardError('HTTP', `Request to ${host} failed`, { cause: err })
}

async function send(url: string, init: RequestInit, opts: RequestOptions): Promise<RawResponse> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (opts.userAgent) headers.set('User-Agent', opts.userAgent)
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchFn(url, {
      ...init,
      headers,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
    })
  } catch (err) {
    throw networkError(err, url)
  }
  const text = await res.text().catch(() => '')
  return { status: res.status, text }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseBody<T>(schema: ZodType<T>, text: string, url: string): T {
  const host = new URL(url).host
  const data = tryParseJson(text)
  if (data === null) throw new ShardError('AUTH_FAILED', `Unexpected response from ${host}`)
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ShardError('AUTH_FAILED', `Unexpected response shape from ${host}`, {
      details: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))
    })
  }
  return parsed.data
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300
}

function servicesErrorMessage(text: string): string | null {
  const parsed = MinecraftServicesErrorSchema.safeParse(tryParseJson(text))
  return parsed.success && parsed.data.errorMessage ? parsed.data.errorMessage : null
}

/** Maps a non-2xx status to an error; 5xx and 429 are transient, everything else is an auth failure. */
function statusError(url: string, status: number, text: string, what: string): ShardError {
  const host = new URL(url).host
  if (status === 429) {
    return new ShardError('RATE_LIMITED', `${host} is rate limiting sign-in attempts. Try again in a minute.`)
  }
  if (status >= 500) {
    return new ShardError('HTTP', `${what} is unavailable right now (HTTP ${status})`, { details: { status, url } })
  }
  const message = servicesErrorMessage(text)
  return new ShardError('AUTH_FAILED', message ? `${what} failed: ${message}` : `${what} was rejected (HTTP ${status})`, {
    details: { status, url }
  })
}

function xstsError(text: string): ShardError {
  const parsed = XstsErrorResponseSchema.safeParse(tryParseJson(text))
  const xerr = parsed.success ? parsed.data.XErr : null
  switch (xerr) {
    case 2148916227:
      return new ShardError('AUTH_BANNED', 'This account has been banned from Xbox Live.')
    case 2148916233:
      return new ShardError(
        'AUTH_NO_XBOX_PROFILE',
        'This Microsoft account has no Xbox profile. Create one at xbox.com and try again.'
      )
    case 2148916235:
      return new ShardError('AUTH_REGION_BLOCKED', 'Xbox Live is not available in your country or region.')
    case 2148916236:
    case 2148916237:
      return new ShardError(
        'AUTH_ADULT_VERIFICATION',
        'This account needs adult verification on xbox.com before it can sign in.'
      )
    case 2148916238:
      return new ShardError(
        'AUTH_CHILD_ACCOUNT',
        'This account is under 18 and must be added to a Microsoft family by an adult.'
      )
    default:
      return new ShardError(
        'AUTH_FAILED',
        xerr === null ? 'Xbox Live rejected the sign-in.' : `Xbox Live rejected the sign-in (XErr ${xerr}).`,
        xerr === null ? {} : { details: { xerr } }
      )
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function msToXbl(accessToken: string, opts: RequestOptions = {}): Promise<{ token: string; uhs: string }> {
  const { status, text } = await send(
    URLS.xblAuth,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${accessToken}` },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    },
    opts
  )
  if (!isOk(status)) throw statusError(URLS.xblAuth, status, text, 'Xbox Live sign-in')
  const body = parseBody(XboxTokenResponseSchema, text, URLS.xblAuth)
  const uhs = body.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new ShardError('AUTH_FAILED', 'Xbox Live did not return a user hash.')
  return { token: body.Token, uhs }
}

export async function xblToXsts(xblToken: string, relyingParty: string, opts: RequestOptions = {}): Promise<XstsResult> {
  const { status, text } = await send(
    URLS.xstsAuth,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
        RelyingParty: relyingParty,
        TokenType: 'JWT'
      })
    },
    opts
  )
  if (status === 401) throw xstsError(text)
  if (!isOk(status)) throw statusError(URLS.xstsAuth, status, text, 'Xbox Live authorization')
  const body = parseBody(XboxTokenResponseSchema, text, URLS.xstsAuth)
  const claim = body.DisplayClaims.xui[0]
  if (!claim) throw new ShardError('AUTH_FAILED', 'Xbox Live did not return a user hash.')
  return { token: body.Token, uhs: claim.uhs, xid: claim.xid ?? null }
}

export async function xstsToMinecraft(
  uhs: string,
  xstsToken: string,
  opts: RequestOptions = {}
): Promise<{ accessToken: string; expiresAt: string }> {
  const url = `${URLS.minecraftServices}/authentication/login_with_xbox`
  const { status, text } = await send(
    url,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` }) },
    opts
  )
  if (!isOk(status)) throw statusError(url, status, text, 'Minecraft sign-in')
  const body = parseBody(MinecraftLoginResponseSchema, text, url)
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString() }
}

/** True when the store entitlements include Java Edition. Game Pass accounts return an empty list. */
export async function checkEntitlements(mcToken: string, opts: RequestOptions = {}): Promise<boolean> {
  const url = `${URLS.minecraftServices}/entitlements/mcstore`
  const { status, text } = await send(url, { method: 'GET', headers: bearer(mcToken) }, opts)
  if (!isOk(status)) throw statusError(url, status, text, 'Ownership check')
  const body = parseBody(EntitlementsResponseSchema, text, url)
  return body.items.some((item) => OWNERSHIP_ITEMS.has(item.name))
}

export function toMinecraftProfile(raw: MinecraftProfileResponse): MinecraftProfile {
  return {
    id: uuidWithoutDashes(raw.id),
    name: raw.name,
    skins: raw.skins.map((s) => ({
      id: s.id,
      state: s.state === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      url: s.url,
      variant: s.variant === 'SLIM' ? 'SLIM' : 'CLASSIC',
      textureKey: s.textureKey ?? null
    })),
    capes: raw.capes.map((c) => ({
      id: c.id,
      state: c.state === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      url: c.url,
      alias: c.alias ?? ''
    }))
  }
}

/** The Java Edition profile, or null when the account has none yet (HTTP 404). */
export async function fetchProfile(mcToken: string, opts: RequestOptions = {}): Promise<MinecraftProfile | null> {
  const url = `${URLS.minecraftServices}/minecraft/profile`
  const { status, text } = await send(url, { method: 'GET', headers: bearer(mcToken) }, opts)
  if (status === 404) return null
  if (status === 401) {
    throw new ShardError('AUTH_REFRESH_FAILED', 'Your Minecraft session is no longer valid. Please sign in again.')
  }
  if (!isOk(status)) throw statusError(url, status, text, 'Profile lookup')
  return toMinecraftProfile(parseBody(MinecraftProfileResponseSchema, text, url))
}

/**
 * Runs the full chain from a Microsoft access token. Ownership rule: an existing profile is
 * always accepted (covers Game Pass); without a profile, store entitlements decide between
 * "owns the game but has no profile" and "does not own the game".
 */
export async function runChain(msAccessToken: string, opts: ChainOptions = {}): Promise<ChainResult> {
  const stage = (s: LoginStage): void => opts.onStage?.(s)

  stage('xbox')
  const xbl = await msToXbl(msAccessToken, opts)

  stage('xsts')
  const [game, xbox] = await Promise.all([
    xblToXsts(xbl.token, MINECRAFT_RELYING_PARTY, opts),
    xblToXsts(xbl.token, XBOX_RELYING_PARTY, opts).catch(() => null)
  ])

  stage('minecraft')
  const mc = await xstsToMinecraft(game.uhs, game.token, opts)

  stage('entitlements')
  const owns = await checkEntitlements(mc.accessToken, opts)

  stage('profile')
  const profile = await fetchProfile(mc.accessToken, opts)
  if (!profile) {
    if (owns) {
      throw new ShardError(
        'AUTH_NO_PROFILE',
        'Your account owns Minecraft but has no Java Edition profile yet. Create one at minecraft.net and sign in again.'
      )
    }
    throw new ShardError('AUTH_NO_GAME', 'This Microsoft account does not own Minecraft: Java Edition.')
  }

  stage('done')
  return { profile, mcAccessToken: mc.accessToken, mcExpiresAt: mc.expiresAt, xuid: xbox?.xid ?? '' }
}
