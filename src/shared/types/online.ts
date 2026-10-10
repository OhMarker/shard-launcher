/** Shard API (online features): tokens, shop, friends and admin tools. See CONTRACT.md. */

/**
 * Staff role from the Shard API. Owners are the uuids in `ADMIN_UUIDS`; admins and mods are set by
 * staff. Mods may only look players up. null for everyone else (and for older APIs).
 */
export type StaffRole = 'owner' | 'admin' | 'mod'

/** The signed-in player as the Shard API sees them. UUIDs are lower-case without dashes. */
export interface ShardMe {
  uuid: string
  name: string
  tokens: number
  /** Cosmetic ids this player owns. Admins own every shop item. */
  owned: string[]
  /** Equipped cape id, shown to every Shard player. */
  cape: string | null
  /** Equipped id per online slot; absent from APIs before shields and bandanas (use equippedOf). */
  equipped?: { cape: string | null; shield: string | null; bandana: string | null }
  /** True for owners and admins (kept for older APIs; prefer `role`). */
  admin: boolean
  role?: StaffRole | null
  inGame: boolean
  /** Seconds of active play left until the next +10 tokens. */
  secondsToNextTokens: number
}

export interface ShopItem {
  id: string
  /** What it costs now, after any sale. */
  price: number
  /** The price before the sale; equal to `price` when there is no sale (and for older APIs). */
  basePrice: number
  /** 0 to 90; 0 when not on sale (and for older APIs). */
  salePercent: number
  /** Bundles: the ids it gives. The bundle always costs `price` and gives whatever is missing. */
  items?: string[]
}

/** `GET /v1/admin/shop`: every shop item, hidden ones too, with how many were bought. */
export interface AdminShopItem extends ShopItem {
  hidden: boolean
  sold: number
}

/** `GET /v1/admin/stats`. */
export interface AdminStats {
  players: number
  inGameNow: number
  activeToday: number
  tokensHeld: number
  purchases: number
  codeRedemptions: number
  staff: number
  /** Paid Store purchases (refunded ones not counted) and what they brought in, in USD cents. */
  storePurchases: number
  storeRevenueCents: number
}

/** A Shard pack in the Store (`GET /v1/store/packs`). Prices are USD cents. */
export interface StorePack {
  id: string
  name: string
  priceCents: number
  shards: number
  /** Extra Shards over the cheapest pack's rate, whole percent. */
  bonusPercent: number
  bestValue: boolean
}

export interface StorePacks {
  /** False until the API has a payment key: packs show but cannot be bought. */
  open: boolean
  /** Stripe test keys: test cards only, no real money (staff only outside local dev). */
  testMode: boolean
  packs: StorePack[]
}

export type StorePurchaseStatus = 'open' | 'paid' | 'expired' | 'refunded' | 'disputed'

/** One Stripe checkout and what happened to it. */
export interface StorePurchase {
  id: string
  packId: string
  packName: string
  priceCents: number
  shards: number
  status: StorePurchaseStatus
  createdAt: number
  creditedAt: number | null
}

/** `POST /v1/store/checkout`: the Stripe page the launcher opened in the browser. */
export interface StoreCheckout {
  sessionId: string
  url: string
}

/** `POST /v1/store/confirm`: the purchase now, and whether this call added the Shards. */
export interface StoreConfirm {
  purchase: StorePurchase
  credited: boolean
}

/** A pack as staff edit it (`GET /v1/admin/packs`), inactive ones too. */
export interface AdminPack {
  id: string
  name: string
  priceCents: number
  shards: number
  active: boolean
  bestValue: boolean
  sort: number
}

export interface AdminPacks {
  open: boolean
  packs: AdminPack[]
  paidPurchases: number
  revenueCents: number
}

/** A promo code as staff see it (`GET /v1/admin/codes`). */
export interface PromoCode {
  /** Upper case; 3 to 32 letters, digits, - or _. */
  code: string
  tokens: number
  items: string[]
  /** Uses allowed per round; null for unlimited. */
  maxUses: number | null
  /** Epoch milliseconds, or null for never. */
  expiresAt: number | null
  /** Each player may redeem once per round; Reset starts the next round. */
  round: number
  active: boolean
  note: string
  usesThisRound: number
  usesTotal: number
  createdAt: number | null
}

/** `POST /v1/admin/codes` body (create or update). */
export interface PromoCodeInput {
  code: string
  tokens: number
  items: string[]
  maxUses: number | null
  expiresAt: number | null
  active: boolean
  note: string
}

/** `POST /v1/redeem`: what the code gave and the player afterwards. */
export interface RedeemResult {
  granted: { tokens: number; items: string[] }
  me: ShardMe
}

export interface FriendPerson {
  uuid: string
  name: string
}

/** Friends see only a name and whether the other player is in game; nothing else. */
export interface Friend extends FriendPerson {
  inGame: boolean
  /** Epoch milliseconds of the last in-game heartbeat, or null when never seen in game. */
  lastSeen: number | null
}

export interface FriendsView {
  friends: Friend[]
  incoming: FriendPerson[]
  outgoing: FriendPerson[]
}

export interface AdminPlayer {
  uuid: string
  name: string
  tokens: number
  owned: string[]
  cape: string | null
  admin: boolean
  role?: StaffRole | null
  inGame: boolean
  lastSeen: number | null
}

/**
 * What the renderer needs to decide how the online features look:
 * - `unavailable`: no API URL yet, or the API cannot be reached; everything stays local.
 * - `signed-out`: no Microsoft account to sign in to Shard with. The shop is public, so items it
 *   sells show as not owned (and buyable after signing in).
 * - `error`: the API answered but signing in failed (shown inline, the page keeps working).
 * - `ready`: signed in; `me` and the shop are fresh.
 */
export type OnlineState =
  | { status: 'unavailable'; message: string }
  | { status: 'signed-out'; shop: ShopItem[] }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: ShardMe; shop: ShopItem[] }
