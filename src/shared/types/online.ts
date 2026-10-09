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
  /** True for owners and admins (kept for older APIs; prefer `role`). */
  admin: boolean
  role?: StaffRole | null
  inGame: boolean
  /** Seconds of active play left until the next +10 tokens. */
  secondsToNextTokens: number
}

export interface ShopItem {
  id: string
  price: number
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
