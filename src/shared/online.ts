/**
 * Pure rules for the Shard online features: API URL validation, API error mapping, ownership
 * and the buy button's state. Shared by the main process and the renderer; no I/O, so Vitest
 * covers every branch (tests/online.test.ts).
 */
import { ShardError, type ShardErrorCode } from './errors'
import { type Cosmetic } from './types/cosmetics'
import { type Friend, type ShopItem, type StaffRole } from './types/online'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Normalises an API base URL (no trailing slash). The hosted services.json must point at https;
 * plain http is accepted only for a local development server (`allowLocalHttp`).
 */
export function validateApiBase(raw: string, opts: { allowLocalHttp?: boolean } = {}): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ShardError('SHARD_API_UNAVAILABLE', 'The Shard API address is not a valid URL')
  }
  const localHttp = url.protocol === 'http:' && opts.allowLocalHttp === true && LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) {
    throw new ShardError('SHARD_API_UNAVAILABLE', 'The Shard API address must use https')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ShardError('SHARD_API_UNAVAILABLE', 'The Shard API address must be a plain base URL')
  }
  return url.toString().replace(/\/+$/, '')
}

const STATUS_CODES: Record<number, ShardErrorCode> = {
  400: 'INVALID_INPUT',
  401: 'AUTH_FAILED',
  404: 'NOT_FOUND',
  413: 'INVALID_INPUT',
  429: 'RATE_LIMITED'
}

/** The `{ "error": "..." }` message from an API error body, when there is one. */
export function apiErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) return parsed.error.trim().slice(0, 300)
  } catch {
    /* not JSON */
  }
  return null
}

/**
 * Maps a Shard API error response to a ShardError that carries the API's own message, so toasts
 * read "Bob has not used Shard yet" instead of "HTTP 404". 5xx means the service is down.
 */
export function apiError(status: number, body: string): ShardError {
  const message = apiErrorMessage(body)
  if (status >= 500) {
    return new ShardError('SHARD_API_UNAVAILABLE', message ?? 'The Shard server had a problem; try again soon', {
      details: { status }
    })
  }
  const code = STATUS_CODES[status] ?? 'SHARD_API'
  return new ShardError(code, message ?? `The Shard server refused the request (HTTP ${status})`, {
    details: { status }
  })
}

/** Errors that mean "the online features are not reachable right now" rather than a real failure. */
export function isUnavailableError(err: unknown): boolean {
  const code = ShardError.from(err).code
  return code === 'SHARD_API_UNAVAILABLE' || code === 'OFFLINE' || code === 'TIMEOUT'
}

/**
 * Owned cosmetic ids, in catalogue order. Without the API (`online` null) the catalogue decides:
 * free items plus the local unlock list (`localOwned`, which already includes free items). With
 * the API, anything the shop sells is owned only when the API says so; items the shop does not
 * sell keep the catalogue rule.
 */
export function effectiveOwned(
  catalogue: readonly Pick<Cosmetic, 'id'>[],
  localOwned: readonly string[],
  online: { owned: readonly string[]; shop: readonly ShopItem[] } | null
): string[] {
  if (!online) return catalogue.filter((c) => localOwned.includes(c.id)).map((c) => c.id)
  const sold = new Set(online.shop.map((item) => item.id))
  const apiOwned = new Set(online.owned)
  return catalogue
    .filter((c) => (sold.has(c.id) ? apiOwned.has(c.id) : localOwned.includes(c.id)))
    .map((c) => c.id)
}

export type BuyState =
  | { kind: 'owned' }
  | { kind: 'not-for-sale' }
  | { kind: 'buy'; price: number }
  | { kind: 'short'; price: number; need: number }

/** What the buy button shows for one cosmetic. */
export function buyState(price: number | null | undefined, tokens: number, owned: boolean): BuyState {
  if (owned) return { kind: 'owned' }
  if (price === null || price === undefined) return { kind: 'not-for-sale' }
  if (tokens < price) return { kind: 'short', price, need: price - tokens }
  return { kind: 'buy', price }
}

/** Whole minutes of play until the next +10 tokens (at least 1, so the hint never says "0 min"). */
export function minutesToNextTokens(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.max(1, Math.ceil(seconds / 60))
}

/** In game first, then most recently seen, then by name. */
export function sortFriends(friends: readonly Friend[]): Friend[] {
  return [...friends].sort((a, b) => {
    if (a.inGame !== b.inGame) return a.inGame ? -1 : 1
    const seen = (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
    if (seen !== 0) return seen
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/** Minecraft names: 1-16 of A-Z a-z 0-9 _ (the API's rule). */
export function isValidMinecraftName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,16}$/.test(name)
}

/** "name:uuid" from SHARD_DEV_FAKE_ACCOUNT, or null when malformed. */
export function parseFakeAccount(raw: string | undefined): { username: string; uuid: string } | null {
  if (!raw) return null
  const [name, id, extra] = raw.trim().split(':')
  if (!name || !id || extra !== undefined || !isValidMinecraftName(name)) return null
  const uuid = id.replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(uuid) ? { username: name, uuid } : null
}

// ---------------------------------------------------------------------------
// Staff roles (see shard-api/API.md "Roles")
// ---------------------------------------------------------------------------

/** A role the launcher can give or take: admin, mod, or none (null). Owners are set on the server. */
export type AssignableRole = 'admin' | 'mod' | null

/**
 * The staff role of a player from the API. Older APIs send only `admin`, which then reads as admin
 * (they had no mods).
 */
export function staffRoleOf(player: { admin: boolean; role?: StaffRole | null } | null | undefined): StaffRole | null {
  if (!player) return null
  return player.role ?? (player.admin ? 'admin' : null)
}

/** Owners and admins may change tokens, cosmetics and prices; mods may only look players up. */
export function canEditPlayers(role: StaffRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Roles the viewer may set on `target`, including null (no role), other than the role it has now.
 * Owners give admin or mod to anyone but an owner; admins give or take mod from mods and players
 * (not admins); mods give nothing. Nobody changes an owner or their own role. Empty means no control.
 */
export function rolesYouCanAssign(
  viewerRole: StaffRole | null,
  viewerUuid: string | null,
  target: { uuid: string; admin: boolean; role?: StaffRole | null }
): AssignableRole[] {
  const current = staffRoleOf(target)
  if (viewerUuid !== null && target.uuid === viewerUuid) return []
  if (current === 'owner') return []
  let allowed: AssignableRole[]
  if (viewerRole === 'owner') allowed = ['admin', 'mod', null]
  else if (viewerRole === 'admin') allowed = current === 'admin' ? [] : ['mod', null]
  else return []
  return allowed.includes(current as AssignableRole) ? allowed.filter((r) => r !== current) : []
}

export const ROLE_LABELS: Record<StaffRole, string> = { owner: 'Owner', admin: 'Admin', mod: 'Mod' }
