/**
 * Pure rules for the Shard online features: API URL validation, API error mapping, ownership
 * and the buy button's state. Shared by the main process and the renderer; no I/O, so Vitest
 * covers every branch (tests/online.test.ts).
 */
import { ShardError, type ShardErrorCode } from './errors'
import { type Cosmetic, type OnlineSlot, ONLINE_SLOTS } from './types/cosmetics'
import {
  type Friend,
  type PromoCode,
  type PromoCodeInput,
  type ShardMe,
  type ShopItem,
  type StaffRole
} from './types/online'

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

// ---------------------------------------------------------------------------
// Slots and bundles (the OhMarker set; shard-api/API.md)
// ---------------------------------------------------------------------------

/** The API's slot for an id: `cape-...`, `shield-...`, `bandana-...` (its own rule), else null. */
export function onlineSlotOf(id: string): OnlineSlot | null {
  return ONLINE_SLOTS.find((slot) => id.startsWith(`${slot}-`)) ?? null
}

/**
 * `POST /v1/equip` body. Capes keep the original `{ cape }` body, which every API version reads;
 * shields and bandanas use `{ slot, id }`.
 */
export function equipBody(
  slot: OnlineSlot,
  id: string | null
): { cape: string | null } | { slot: OnlineSlot; id: string | null } {
  return slot === 'cape' ? { cape: id } : { slot, id }
}

/**
 * Whether an equip change goes to the API: the shop must sell the item (a catalogue-only item
 * stays local). Clearing a cape always goes; clearing a shield or bandana goes only when the shop
 * sells something for that slot, because an API from before those slots would read `{ slot, id }`
 * as clearing the cape.
 */
export function apiSyncsSlot(
  slot: OnlineSlot,
  id: string | null,
  shop: readonly ShopItem[]
): boolean {
  if (id !== null) return shop.some((item) => item.id === id)
  return slot === 'cape' || shop.some((item) => onlineSlotOf(item.id) === slot)
}

/** What the player wears per online slot; older APIs only know the cape. */
export function equippedOf(
  me: Pick<ShardMe, 'cape' | 'equipped'>
): Record<OnlineSlot, string | null> {
  return {
    cape: me.equipped?.cape ?? me.cape,
    shield: me.equipped?.shield ?? null,
    bandana: me.equipped?.bandana ?? null
  }
}

export interface BundleItemState {
  id: string
  owned: boolean
  /** The item's own shop price, or null when the shop does not sell it alone. */
  price: number | null
}

export interface BundleState {
  items: BundleItemState[]
  /** Ids the bundle would give now. */
  missing: string[]
  /** Everything in the bundle is owned (the API then also lists the bundle id). */
  complete: boolean
  /** The bundle's price, the same whatever is missing; null when the shop does not sell it. */
  price: number | null
  /** The missing items bought one by one, when each has a price. */
  missingPrice: number | null
  /** How much the bundle saves over buying the missing items one by one; null when it does not. */
  saving: number | null
  /** The buy button; null while there is no balance to compare with (signed out, no API). */
  buy: BuyState | null
}

/**
 * The bundle card's numbers. Items come from the catalogue entry, or else the shop's `items`;
 * `owned` is the effective owned list; `tokens` is null when not signed in to the API.
 */
export function bundleState(
  bundle: Pick<Cosmetic, 'id' | 'items'>,
  owned: readonly string[],
  shop: readonly ShopItem[],
  tokens: number | null
): BundleState {
  const prices = new Map(shop.map((item) => [item.id, item.price]))
  // Catalogue order (cape, shield, bandana) reads best; the shop's list when the catalogue has none.
  const ids = bundle.items ?? shop.find((item) => item.id === bundle.id)?.items ?? []
  const items = ids.map((id) => ({ id, owned: owned.includes(id), price: prices.get(id) ?? null }))
  const missing = items.filter((item) => !item.owned).map((item) => item.id)
  const complete = owned.includes(bundle.id) || (items.length > 0 && missing.length === 0)
  const price = prices.get(bundle.id) ?? null
  const missingItems = items.filter((item) => !item.owned)
  const missingPrice = missingItems.every((item) => item.price !== null)
    ? missingItems.reduce((sum, item) => sum + (item.price ?? 0), 0)
    : null
  const saving =
    !complete && price !== null && missingPrice !== null && missingPrice > price
      ? missingPrice - price
      : null
  const buy = complete
    ? buyState(price, 0, true)
    : tokens === null
      ? null
      : buyState(price, tokens, false)
  return { items, missing: complete ? [] : missing, complete, price, missingPrice, saving, buy }
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

// ---------------------------------------------------------------------------
// Sales (shop items carry basePrice and salePercent; shard-api/API.md "Shop items")
// ---------------------------------------------------------------------------

export const MAX_SALE_PERCENT = 90

/** The API's rounding: price after a sale of `percent` (clamped to 0..90), whole tokens. */
export function salePrice(basePrice: number, percent: number): number {
  const safe = Number.isFinite(percent) ? percent : 0
  const pct = Math.max(0, Math.min(MAX_SALE_PERCENT, Math.round(safe)))
  return Math.round((basePrice * (100 - pct)) / 100)
}

export interface SaleDisplay {
  /** What it costs now. */
  price: number
  /** The struck-through price; null when not on sale. */
  was: number | null
  /** "-20%"; null when not on sale. */
  badge: string | null
}

/** How a price shows on a card: the price, plus the old price and a "-N%" badge during a sale. */
export function saleDisplay(
  item: Pick<ShopItem, 'price'> & Partial<Pick<ShopItem, 'basePrice' | 'salePercent'>>
): SaleDisplay {
  const base = item.basePrice ?? item.price
  const pct = item.salePercent ?? 0
  if (pct <= 0 || base <= item.price) return { price: item.price, was: null, badge: null }
  return { price: item.price, was: base, badge: `-${Math.round(pct)}%` }
}

// ---------------------------------------------------------------------------
// Promo codes (POST /v1/redeem and the staff Codes tab)
// ---------------------------------------------------------------------------

/** Codes are 3 to 32 letters, digits, - or _, compared in upper case (the API's rule). */
export function normalizePromoCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null
}

const REDEEM_MESSAGES: Record<number, string> = {
  404: 'That code does not exist.',
  409: 'You already used this code.',
  410: 'That code has expired.',
  429: 'That code has been used up.'
}

/**
 * The message shown under the Redeem box. The API's own message wins (it is written for players);
 * otherwise a readable line per status (404 unknown, 409 used, 410 expired, 429 used up).
 */
export function redeemErrorMessage(err: unknown): string {
  const e = ShardError.from(err)
  const status = (e.details as { status?: unknown } | undefined)?.status
  const fallback = typeof status === 'number' ? REDEEM_MESSAGES[status] : undefined
  if (e.code === 'SHARD_API_UNAVAILABLE' || e.code === 'OFFLINE' || e.code === 'TIMEOUT') {
    return 'Could not reach the Shard server. Check your connection and try again.'
  }
  if (e.code === 'ACCOUNT_REQUIRED') return 'Sign in with your Microsoft account to redeem codes.'
  const message = e.message.trim()
  const generic = message === '' || /HTTP \d+|refused the request/.test(message)
  if (fallback && generic) return fallback
  if (message === '') return 'Could not redeem that code.'
  return /[.!?]$/.test(message) ? message : `${message}.`
}

/** The staff code form as typed (strings, so half-typed numbers are kept). */
export interface CodeDraft {
  code: string
  tokens: string
  items: string[]
  /** Empty for unlimited. */
  maxUses: string
  /** `<input type="datetime-local">` value (local time), empty for never. */
  expiresAt: string
  active: boolean
  note: string
}

export const EMPTY_CODE_DRAFT: CodeDraft = {
  code: '',
  tokens: '0',
  items: [],
  maxUses: '',
  expiresAt: '',
  active: true,
  note: ''
}

export type CodeDraftErrors = Partial<
  Record<'code' | 'tokens' | 'items' | 'maxUses' | 'expiresAt' | 'note', string>
>

const pad = (n: number): string => String(n).padStart(2, '0')

/** Epoch ms -> `datetime-local` value in local time ("2026-10-31T23:59"). */
export function toDateTimeLocal(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` value -> epoch ms (local time); null when empty or not a date. */
export function fromDateTimeLocal(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)))
  const date = new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== (mo ?? 1) - 1) return null
  return date.getTime()
}

/** The form for an existing code (Edit). */
export function draftFromCode(code: PromoCode): CodeDraft {
  return {
    code: code.code,
    tokens: String(code.tokens),
    items: [...code.items],
    maxUses: code.maxUses === null ? '' : String(code.maxUses),
    expiresAt: toDateTimeLocal(code.expiresAt),
    active: code.active,
    note: code.note
  }
}

/**
 * Checks the staff code form with the API's rules and builds the request body. With `now`, a new
 * code refuses an expiry in the past (editing an expired code may keep its date).
 */
export function validateCodeDraft(
  draft: CodeDraft,
  opts: { now?: number; editing?: boolean } = {}
): { ok: true; input: PromoCodeInput } | { ok: false; errors: CodeDraftErrors } {
  const errors: CodeDraftErrors = {}
  const code = normalizePromoCode(draft.code)
  if (!code) errors.code = '3 to 32 letters, numbers, - or _'
  const tokensRaw = draft.tokens.trim() === '' ? '0' : draft.tokens.trim()
  const tokens = Number(tokensRaw)
  if (!/^\d+$/.test(tokensRaw) || tokens > 1_000_000) errors.tokens = '0 to 1,000,000'
  const items = [...new Set(draft.items)]
  if (items.length > 20) errors.items = 'At most 20 items'
  else if (!errors.tokens && tokens === 0 && items.length === 0) {
    errors.items = 'A code must give Shards or an item'
  }
  let maxUses: number | null = null
  const usesRaw = draft.maxUses.trim()
  if (usesRaw !== '') {
    const n = Number(usesRaw)
    if (!/^\d+$/.test(usesRaw) || n < 1 || n > 1_000_000) errors.maxUses = '1 or more, or empty for unlimited'
    else maxUses = n
  }
  let expiresAt: number | null = null
  if (draft.expiresAt.trim() !== '') {
    expiresAt = fromDateTimeLocal(draft.expiresAt)
    if (expiresAt === null) errors.expiresAt = 'Pick a date and time'
    else if (!opts.editing && opts.now !== undefined && expiresAt <= opts.now) {
      errors.expiresAt = 'That time has already passed'
    }
  }
  if (draft.note.length > 200) errors.note = 'At most 200 characters'
  if (!code || Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    input: { code, tokens, items, maxUses, expiresAt, active: draft.active, note: draft.note.trim() }
  }
}

export type CodeStatus = 'active' | 'off' | 'expired' | 'used-up'

/** One word for a code's state in the staff list. */
export function codeStatus(
  code: Pick<PromoCode, 'active' | 'expiresAt' | 'maxUses' | 'usesThisRound'>,
  now: number
): CodeStatus {
  if (!code.active) return 'off'
  if (code.expiresAt !== null && now >= code.expiresAt) return 'expired'
  if (code.maxUses !== null && code.usesThisRound >= code.maxUses) return 'used-up'
  return 'active'
}

// ---------------------------------------------------------------------------
// Store: Shard packs bought with real money (Stripe Checkout)
// ---------------------------------------------------------------------------

/** "$4.99" from USD cents. */
export function formatUsd(cents: number): string {
  const c = Math.max(0, Math.round(cents))
  return `$${Math.floor(c / 100).toLocaleString('en-US')}.${String(c % 100).padStart(2, '0')}`
}

/** "2,800" */
export function formatShards(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** What a purchase's status means to the player. */
export function purchaseStatusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Added'
    case 'refunded':
      return 'Refunded'
    case 'disputed':
      return 'Disputed'
    case 'expired':
      return 'Not finished'
    default:
      return 'Waiting for payment'
  }
}

/** The cheapest active pack that covers {@code missing} Shards (or the biggest one), for "Need N more". */
export function packFor<T extends { shards: number; priceCents: number }>(packs: readonly T[], missing: number): T | null {
  if (packs.length === 0) return null
  const enough = [...packs].filter((p) => p.shards >= missing).sort((a, b) => a.priceCents - b.priceCents)
  return enough[0] ?? [...packs].sort((a, b) => b.shards - a.shards)[0]
}

/** A readable line for a failed checkout or check. */
export function storeErrorMessage(err: unknown): string {
  const e = ShardError.from(err)
  const status = (e.details as { status?: unknown } | undefined)?.status
  if (e.code === 'SHARD_API_UNAVAILABLE' || e.code === 'OFFLINE' || e.code === 'TIMEOUT') {
    return 'Could not reach the Shard server. Check your connection and try again.'
  }
  if (e.code === 'ACCOUNT_REQUIRED') return 'Sign in with your Microsoft account to buy Shards.'
  if (status === 503) return 'The Store is not open yet.'
  if (status === 429) return 'Too many unfinished checkouts. Finish one, or wait a little and try again.'
  if (status === 404) return 'That pack is not for sale any more.'
  const message = e.message.trim()
  if (message === '' || /HTTP \d+/.test(message)) return 'Something went wrong talking to the Store. Try again.'
  return /[.!?]$/.test(message) ? message : `${message}.`
}

/** "$4.99", "4.99" or "5" → 499 cents; null when it is not a price. */
export function parseUsd(raw: string): number | null {
  const m = raw.trim().replace(/^\$/, '').match(/^(\d{1,4})(?:\.(\d{1,2}))?$/)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
}
