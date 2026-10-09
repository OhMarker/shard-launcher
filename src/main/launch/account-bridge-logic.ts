/**
 * Pure rules for the in-game account switching bridge (contract:
 * shard-client/docs/ACCOUNT-SWITCH-API.md): request checks, routing and response shapes.
 * The HTTP server in account-bridge.ts only moves bytes; everything decidable lives here.
 * Nothing in this file may log: responses can carry Minecraft access tokens.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { ShardError, type ShardErrorCode } from '@shared/errors'

export interface BridgeResponse {
  status: number
  body: Record<string, unknown>
}

export interface BridgeRequest {
  method: string
  /** Request target as received, e.g. `/v1/accounts?x=1`. */
  url: string
  /** Lower-cased header names, as Node delivers them. */
  headers: Record<string, string | string[] | undefined>
}

export type BridgeRoute = { kind: 'list' } | { kind: 'session'; accountId: string } | { kind: 'add' }

/** What the bridge needs from the account service. Injected so the handler stays testable. */
export interface BridgeDeps {
  listAccounts(): Array<{ id: string; username: string; isActive: boolean; needsReauth: boolean }>
  /** Valid Minecraft session for the account, refreshing the token when needed. */
  getSession(accountId: string): Promise<{ username: string; uuid: string; accessToken: string; xuid: string }>
  setActive(accountId: string): void
  /** Brings the launcher to the front and opens its sign-in. Must not throw. */
  requestAdd(): void
  clientId: string
}

/** Refresh failures that mean the player has to sign in again in the launcher (409). */
const REAUTH_CODES: ReadonlySet<ShardErrorCode> = new Set<ShardErrorCode>([
  'AUTH_REFRESH_FAILED',
  'AUTH_FAILED',
  'AUTH_NO_XBOX_PROFILE',
  'AUTH_CHILD_ACCOUNT',
  'AUTH_REGION_BLOCKED',
  'AUTH_ADULT_VERIFICATION',
  'AUTH_BANNED',
  'AUTH_NO_GAME',
  'AUTH_NO_PROFILE',
  'AUTH_NOT_CONFIGURED'
])

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/
const SESSION_PATH = /^\/v1\/accounts\/([^/]+)\/session$/

export const UNKNOWN_ACCOUNT = 'unknown account'
export const SIGN_IN_AGAIN = 'sign in again in Shard Launcher'

/** 32 random bytes as hex, new for every launch. */
export function generateBridgeSecret(): string {
  return randomBytes(32).toString('hex')
}

function header(headers: BridgeRequest['headers'], name: string): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

function error(status: number, message: string): BridgeResponse {
  return { status, body: { error: message } }
}

/**
 * Origin first (403, so browsers can never get in even with a guessed secret), then the
 * bearer secret (401), compared in constant time. Null means the request may proceed.
 */
export function checkRequest(headers: BridgeRequest['headers'], secret: string): BridgeResponse | null {
  if (headers.origin !== undefined) return error(403, 'forbidden')
  const auth = header(headers, 'authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(auth)
  if (!match) return error(401, 'unauthorized')
  const given = Buffer.from(match[1] ?? '', 'utf8')
  const expected = Buffer.from(secret, 'utf8')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return error(401, 'unauthorized')
  return null
}

/** Maps method + path to a route, or to a 404/405 response. The query string is ignored. */
export function routeRequest(method: string, url: string): BridgeRoute | BridgeResponse {
  const path = url.split('?')[0] ?? ''
  if (path === '/v1/accounts') return method === 'GET' ? { kind: 'list' } : error(405, 'method not allowed')
  if (path === '/v1/accounts/add') return method === 'POST' ? { kind: 'add' } : error(405, 'method not allowed')
  const session = SESSION_PATH.exec(path)
  if (session) {
    let accountId: string
    try {
      accountId = decodeURIComponent(session[1] ?? '')
    } catch {
      return error(404, UNKNOWN_ACCOUNT)
    }
    if (!ACCOUNT_ID.test(accountId)) return error(404, UNKNOWN_ACCOUNT)
    return method === 'POST' ? { kind: 'session', accountId } : error(405, 'method not allowed')
  }
  return error(404, 'not found')
}

export function accountsBody(accounts: ReturnType<BridgeDeps['listAccounts']>): BridgeResponse['body'] {
  const active = accounts.find((a) => a.isActive) ?? null
  return {
    active: active?.id ?? null,
    accounts: accounts.map((a) => ({ id: a.id, name: a.username, uuid: a.id }))
  }
}

export function sessionBody(
  session: Awaited<ReturnType<BridgeDeps['getSession']>>,
  clientId: string
): BridgeResponse['body'] {
  return {
    name: session.username,
    uuid: session.uuid,
    accessToken: session.accessToken,
    ...(session.xuid ? { xuid: session.xuid } : {}),
    clientId
  }
}

/** Error mapping for a failed session request. The message is the launcher's own, never a token. */
export function sessionError(err: unknown): BridgeResponse {
  const e = ShardError.from(err)
  if (e.code === 'NOT_FOUND') return error(404, UNKNOWN_ACCOUNT)
  if (REAUTH_CODES.has(e.code)) return error(409, SIGN_IN_AGAIN)
  return error(500, e.message || 'internal error')
}

export async function handleBridgeRequest(
  req: BridgeRequest,
  secret: string,
  deps: BridgeDeps
): Promise<BridgeResponse> {
  const denied = checkRequest(req.headers, secret)
  if (denied) return denied
  const route = routeRequest(req.method, req.url)
  if ('status' in route) return route

  switch (route.kind) {
    case 'list':
      return { status: 200, body: accountsBody(deps.listAccounts()) }
    case 'add':
      deps.requestAdd()
      return { status: 202, body: {} }
    case 'session': {
      const account = deps.listAccounts().find((a) => a.id === route.accountId)
      if (!account) return error(404, UNKNOWN_ACCOUNT)
      if (account.needsReauth) return error(409, SIGN_IN_AGAIN)
      try {
        const session = await deps.getSession(account.id)
        deps.setActive(account.id)
        return { status: 200, body: sessionBody(session, deps.clientId) }
      } catch (err) {
        return sessionError(err)
      }
    }
  }
}
