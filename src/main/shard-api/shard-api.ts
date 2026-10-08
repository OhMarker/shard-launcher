/**
 * Client for the Shard API (shard-api/API.md): tokens, the cosmetics shop, friends and the
 * owner's admin tools.
 *
 * - The API's base URL comes from `SHARD_API_URL` (development override) or the hosted
 *   `services.json` in the meta repository, cached like the other manifests. When neither is
 *   available the online features report `unavailable` and the launcher keeps working locally.
 * - Sign-in is per Microsoft account: challenge, Mojang's server join (the same check every
 *   online-mode server uses), verify. The Minecraft access token goes to Mojang only; the Shard
 *   session token lives in memory and is never logged or written to disk.
 */
import { type ZodType } from 'zod'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { uuidWithoutDashes } from '@shared/format'
import { apiError, isUnavailableError, parseFakeAccount, validateApiBase } from '@shared/online'
import {
  AdminPlayerSchema,
  AdminPlayersResponseSchema,
  ChallengeResponseSchema,
  FriendsViewSchema,
  ServicesJsonSchema,
  ShardMeSchema,
  ShopResponseSchema,
  VerifyResponseSchema
} from '@shared/schemas/online'
import { type ShopItem } from '@shared/types'
import { type AppContext, type ShardApiService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { HttpError, httpRequest } from '../net/http'
import { JsonCache } from '../util/json-cache'

const log = createLogger('shard-api')

const SERVICES_MAX_AGE_MS = 6 * 60 * 60_000
/** A resolved base URL is reused this long before services.json is consulted again. */
const BASE_MEMO_MS = 10 * 60_000
/** After a failed lookup, wait this long before trying again (unless the user refreshes). */
const BASE_FAILURE_MEMO_MS = 60_000
const SHOP_MEMO_MS = 60_000
const API_TIMEOUT_MS = 15_000
const NOT_AVAILABLE = 'Shard online features are not available yet'

interface Identity {
  accountId: string
  username: string
  uuid: string
  /** Development-only account from SHARD_DEV_FAKE_ACCOUNT: has no Minecraft token at all. */
  fake: boolean
}

interface CallOptions {
  body?: unknown
  token?: string
}

function isAuthError(err: unknown): boolean {
  const code = ShardError.from(err).code
  return code === 'ACCOUNT_REQUIRED' || code.startsWith('AUTH_')
}

function isExpiredSession(err: unknown): boolean {
  const e = ShardError.from(err)
  const details = e.details as { status?: unknown; source?: unknown } | undefined
  return e.code === 'AUTH_FAILED' && details?.status === 401 && details.source === undefined
}

export function createShardApiService(ctx: AppContext): ShardApiService {
  let base: { url: string; at: number } | null = null
  let baseFailure: { error: ShardError; at: number } | null = null
  let shopMemo: { items: ShopItem[]; at: number } | null = null
  /** accountId -> Shard session token. Memory only. */
  const sessions = new Map<string, string>()
  const signingIn = new Map<string, Promise<string>>()

  /** Development-only switches; both are unreachable in packaged builds. */
  const devAuth = (): boolean => !ctx.isPackaged && process.env.SHARD_API_DEV_AUTH === '1'
  const fakeAccount = (): Identity | null => {
    if (ctx.isPackaged) return null
    const fake = parseFakeAccount(process.env.SHARD_DEV_FAKE_ACCOUNT)
    return fake ? { accountId: `dev:${fake.uuid}`, username: fake.username, uuid: fake.uuid, fake: true } : null
  }

  async function lookupBase(refresh: boolean): Promise<string> {
    const override = process.env.SHARD_API_URL?.trim()
    if (override) return validateApiBase(override, { allowLocalHttp: !ctx.isPackaged })
    try {
      const result = await new JsonCache(ctx.paths.cache).fetch(ctx.manifestUrls().services, ServicesJsonSchema, {
        maxAgeMs: refresh ? 0 : SERVICES_MAX_AGE_MS,
        timeoutMs: 10_000
      })
      return validateApiBase(result.data.api)
    } catch (err) {
      const e = ShardError.from(err)
      log.info(`Shard API not available (${e.code}: ${e.message})`)
      throw new ShardError('SHARD_API_UNAVAILABLE', NOT_AVAILABLE, { cause: err })
    }
  }

  async function resolveBase(refresh = false): Promise<string> {
    const now = Date.now()
    if (!refresh && base && now - base.at < BASE_MEMO_MS) return base.url
    if (!refresh && baseFailure && now - baseFailure.at < BASE_FAILURE_MEMO_MS) throw baseFailure.error
    try {
      const url = await lookupBase(refresh)
      if (base?.url !== url) sessions.clear()
      base = { url, at: now }
      baseFailure = null
      return url
    } catch (err) {
      baseFailure = { error: ShardError.from(err), at: now }
      throw baseFailure.error
    }
  }

  function identity(): Identity | null {
    const fake = fakeAccount()
    if (fake) return fake
    const active = ctx.services.accounts.getActive()
    return active ? { accountId: active.id, username: active.username, uuid: active.id, fake: false } : null
  }

  function requireIdentity(): Identity {
    const who = identity()
    if (!who) throw new ShardError('ACCOUNT_REQUIRED', 'Sign in with your Microsoft account to use Shard online features')
    return who
  }

  /** One JSON request to the API. Non-2xx answers become ShardErrors with the API's message. */
  async function call<T>(url: string, method: 'GET' | 'POST', path: string, schema: ZodType<T>, opts: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    let text: string
    try {
      const res = await httpRequest(`${url}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        timeoutMs: API_TIMEOUT_MS,
        // POSTs are not idempotent (a challenge is single use, a buy spends tokens): never retry.
        retries: method === 'GET' ? 1 : 0
      })
      text = await res.text()
    } catch (err) {
      if (err instanceof HttpError) throw apiError(err.status, err.body)
      throw err
    }
    let data: unknown
    try {
      data = text ? JSON.parse(text) : null
    } catch (err) {
      throw new ShardError('SHARD_API', 'The Shard server sent an answer the launcher does not understand', { cause: err })
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      log.warn(`Unexpected response shape for ${method} ${path}`, parsed.error.issues.slice(0, 3))
      throw new ShardError('SHARD_API', 'The Shard server sent an answer the launcher does not understand')
    }
    return parsed.data
  }

  /** Mojang's server join, exactly as a Minecraft client joining an online-mode server does. */
  async function mojangJoin(accessToken: string, uuid: string, serverId: string): Promise<void> {
    try {
      await httpRequest(URLS.mojangJoin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, selectedProfile: uuidWithoutDashes(uuid), serverId }),
        timeoutMs: API_TIMEOUT_MS,
        retries: 0
      })
    } catch (err) {
      if (err instanceof HttpError) {
        const message =
          err.status === 403
            ? 'Mojang refused the Shard sign-in. Multiplayer may be turned off for this account in its Xbox privacy settings.'
            : err.status === 401
              ? 'Your Minecraft session has expired. Sign in to your Microsoft account again.'
              : `Mojang could not confirm this account (HTTP ${err.status})`
        // `source` keeps a Mojang 401 from looking like an expired Shard session (no retry loop).
        throw new ShardError('AUTH_FAILED', message, { details: { source: 'mojang', status: err.status } })
      }
      throw err
    }
  }

  async function signIn(who: Identity, url: string): Promise<string> {
    const { serverId } = await call(url, 'POST', '/v1/auth/challenge', ChallengeResponseSchema)
    const body: { username: string; serverId: string; devUuid?: string } = { username: who.username, serverId }
    if (devAuth()) {
      // wrangler dev with DEV_AUTH=1 accepts the uuid as-is (local testing only).
      body.devUuid = who.uuid
    } else {
      if (who.fake) throw new ShardError('AUTH_FAILED', 'The development account only works with SHARD_API_DEV_AUTH=1')
      const session = await ctx.services.accounts.getSession(who.accountId)
      await mojangJoin(session.accessToken, session.uuid, serverId)
      body.username = session.username
    }
    const verified = await call(url, 'POST', '/v1/auth/verify', VerifyResponseSchema, { body })
    sessions.set(who.accountId, verified.session)
    log.info(`Signed in to Shard as ${verified.me.name}${verified.me.admin ? ' (admin)' : ''}`)
    return verified.session
  }

  /** De-duplicates concurrent sign-ins for the same account. */
  function signInOnce(who: Identity, url: string): Promise<string> {
    const pending = signingIn.get(who.accountId)
    if (pending) return pending
    const next = signIn(who, url).finally(() => signingIn.delete(who.accountId))
    signingIn.set(who.accountId, next)
    return next
  }

  /** Authenticated call; on 401 (expired or rotated session) signs in again once and retries. */
  async function authed<T>(method: 'GET' | 'POST', path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
    const url = await resolveBase()
    const who = requireIdentity()
    const token = sessions.get(who.accountId) ?? (await signInOnce(who, url))
    try {
      return await call(url, method, path, schema, { body, token })
    } catch (err) {
      if (!isExpiredSession(err)) throw err
      sessions.delete(who.accountId)
      const fresh = await signInOnce(who, url)
      return call(url, method, path, schema, { body, token: fresh })
    }
  }

  async function shopAt(url: string, refresh = false): Promise<ShopItem[]> {
    if (!refresh && shopMemo && Date.now() - shopMemo.at < SHOP_MEMO_MS) return shopMemo.items
    const { items } = await call(url, 'GET', '/v1/shop', ShopResponseSchema)
    shopMemo = { items, at: Date.now() }
    return items
  }

  const service: ShardApiService = {
    async state(opts = {}) {
      let url: string
      try {
        url = await resolveBase(opts.refresh ?? false)
      } catch (err) {
        return { status: 'unavailable', message: ShardError.from(err).message }
      }
      try {
        if (!identity()) return { status: 'signed-out', shop: await shopAt(url, opts.refresh ?? false) }
        const [me, shop] = await Promise.all([service.me(), shopAt(url, opts.refresh ?? false)])
        return { status: 'ready', me, shop }
      } catch (err) {
        const e = ShardError.from(err)
        if (isUnavailableError(e)) return { status: 'unavailable', message: 'Could not reach the Shard server' }
        log.warn(`Shard online state failed (${e.code}: ${e.message})`)
        return { status: 'error', message: e.message }
      }
    },

    async shop() {
      return shopAt(await resolveBase())
    },

    me: () => authed('GET', '/v1/me', ShardMeSchema),

    async buy(id) {
      const me = await authed('POST', '/v1/buy', ShardMeSchema, { id })
      log.info(`Bought ${id}`)
      return me
    },

    equip: (capeId) => authed('POST', '/v1/equip', ShardMeSchema, { cape: capeId }),

    async syncCape(capeId) {
      let url: string
      try {
        url = await resolveBase()
      } catch {
        return null
      }
      try {
        const shop = await shopAt(url)
        // Signed out: the shop's items are not owned (the API decides ownership when it is up).
        if (!identity()) return { owned: [], shop }
        // A cape the shop does not sell is a catalogue cape: the API cannot show it, and the
        // catalogue decides ownership. Leave the API's cape alone.
        if (capeId !== null && !shop.some((item) => item.id === capeId)) return { owned: [], shop }
        const me = await service.equip(capeId)
        return { owned: me.owned, shop }
      } catch (err) {
        // Offline or a Microsoft session that needs attention: fall back to the local rules.
        if (isUnavailableError(err) || (isAuthError(err) && !isExpiredSession(err))) {
          log.info(`Cape not synced to Shard (${ShardError.from(err).code})`)
          return null
        }
        throw err
      }
    },

    friends: () => authed('GET', '/v1/friends', FriendsViewSchema),
    requestFriend: (name) => authed('POST', '/v1/friends/request', FriendsViewSchema, { name }),
    acceptFriend: (uuid) => authed('POST', '/v1/friends/accept', FriendsViewSchema, { uuid }),
    declineFriend: (uuid) => authed('POST', '/v1/friends/decline', FriendsViewSchema, { uuid }),
    removeFriend: (uuid) => authed('POST', '/v1/friends/remove', FriendsViewSchema, { uuid }),

    async adminPlayers(q) {
      const { players } = await authed('GET', `/v1/admin/players?q=${encodeURIComponent(q)}`, AdminPlayersResponseSchema)
      return players
    },
    adminTokens: (player, amount) => authed('POST', '/v1/admin/tokens', AdminPlayerSchema, { player, amount }),
    adminGrant: (player, id) => authed('POST', '/v1/admin/grant', AdminPlayerSchema, { player, id }),
    adminRevoke: (player, id) => authed('POST', '/v1/admin/revoke', AdminPlayerSchema, { player, id }),
    async adminPrice(id, price) {
      const { items } = await authed('POST', '/v1/admin/price', ShopResponseSchema, { id, price })
      shopMemo = { items, at: Date.now() }
      return items
    }
  }
  return service
}

export function registerShardApiIpc(ctx: AppContext): void {
  const api = (): ShardApiService => ctx.services.shardApi
  handle('online:state', ({ refresh }) => api().state({ refresh }))
  handle('online:buy', ({ id }) => api().buy(id))
  handle('friends:list', () => api().friends())
  handle('friends:request', ({ name }) => api().requestFriend(name))
  handle('friends:accept', ({ uuid }) => api().acceptFriend(uuidWithoutDashes(uuid)))
  handle('friends:decline', ({ uuid }) => api().declineFriend(uuidWithoutDashes(uuid)))
  handle('friends:remove', ({ uuid }) => api().removeFriend(uuidWithoutDashes(uuid)))
  handle('admin:players', ({ q }) => api().adminPlayers(q))
  handle('admin:tokens', ({ player, amount }) => api().adminTokens(player, amount))
  handle('admin:grant', ({ player, id }) => api().adminGrant(player, id))
  handle('admin:revoke', ({ player, id }) => api().adminRevoke(player, id))
  handle('admin:price', ({ id, price }) => api().adminPrice(id, price))
}
