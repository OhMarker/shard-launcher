import { type BundleState } from '@shared/online'
import {
  COSMETIC_RARITIES,
  COSMETIC_TYPES,
  type Cosmetic,
  type CosmeticRarity,
  type CosmeticSlot,
  type CosmeticType,
  type EquippedMap
} from '@shared/types'

// ---------------------------------------------------------------------------
// Rarity palette
// ---------------------------------------------------------------------------

export interface RarityStyle {
  label: string
  /** Solid colour for text and icons. */
  color: string
  /** Translucent fill behind badges. */
  soft: string
  /** Border colour for badges and chips. */
  border: string
  /** Outer glow, only for the top tiers. */
  glow: string | null
  /** Two-colour fill for the event tier (special), drawn instead of `soft`. */
  gradient: string | null
}

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const base: Record<CosmeticRarity, { label: string; color: string }> = {
  common: { label: 'Common', color: '#94a3b8' },
  rare: { label: 'Rare', color: '#60a5fa' },
  epic: { label: 'Epic', color: '#a78bfa' },
  legendary: { label: 'Legendary', color: '#fbbf24' },
  mythic: { label: 'Mythic', color: '#fb7185' },
  // Event items: pumpkin orange with a purple second colour (see SPECIAL_SECOND).
  special: { label: 'Special', color: '#fb923c' }
}

/** The second colour of the special tier's gradient. */
export const SPECIAL_SECOND = '#a855f7'

export const RARITY_PALETTE: Record<CosmeticRarity, RarityStyle> = Object.fromEntries(
  COSMETIC_RARITIES.map((rarity) => {
    const { label, color } = base[rarity]
    const style: RarityStyle = {
      label,
      color,
      soft: rgba(color, 0.16),
      border: rgba(color, 0.35),
      glow:
        rarity === 'special'
          ? `0 0 14px ${rgba(color, 0.45)}, 0 0 22px ${rgba(SPECIAL_SECOND, 0.35)}`
          : rarity === 'mythic'
            ? `0 0 18px ${rgba(color, 0.55)}`
            : null,
      gradient:
        rarity === 'special'
          ? // Over a dark base so the badge stays readable on bright preview images.
            `linear-gradient(100deg, ${rgba(color, 0.3)} 0%, ${rgba(SPECIAL_SECOND, 0.34)} 100%), linear-gradient(rgba(14, 10, 24, 0.82), rgba(14, 10, 24, 0.82))`
          : null
    }
    if (rarity === 'special') style.border = rgba(color, 0.55)
    return [rarity, style]
  })
) as Record<CosmeticRarity, RarityStyle>

/** Higher is rarer. */
export const RARITY_RANK: Record<CosmeticRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
  special: 5
}

/** Fallback tile background when a cosmetic has no 2D preview image. */
export function gradientFor(rarity: CosmeticRarity): string {
  const { color } = RARITY_PALETTE[rarity]
  if (rarity === 'special') {
    return `linear-gradient(145deg, ${rgba(color, 0.55)} 0%, ${rgba(SPECIAL_SECOND, 0.4)} 55%, rgba(7, 9, 15, 0.9) 100%)`
  }
  return `linear-gradient(145deg, ${rgba(color, 0.55)} 0%, ${rgba(color, 0.18)} 55%, rgba(7, 9, 15, 0.9) 100%)`
}

// ---------------------------------------------------------------------------
// Types and slots
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<CosmeticType, string> = {
  cape: 'Cape',
  cloak: 'Cloak',
  hat: 'Hat',
  wings: 'Wings',
  bandana: 'Bandana',
  backbling: 'Backbling',
  shield: 'Shield',
  emote: 'Emote',
  bundle: 'Set'
}

/** One line on what an item of this type is, where the name alone does not say it. */
export const TYPE_HINTS: Partial<Record<CosmeticType, string>> = {
  shield: 'Shield skin — your shield in game looks like this',
  bandana: 'Worn on your head',
  bundle: 'Several cosmetics sold together'
}

/**
 * Wardrobe tabs: All, Special (every item of the special rarity: event items such as Halloween),
 * then one per type. Bundles are not a tab: they show as featured cards above the grid.
 */
export type TypeFilter = 'all' | 'special' | Exclude<CosmeticType, 'bundle'>

export const TYPE_FILTERS: readonly TypeFilter[] = [
  'all',
  'special',
  ...COSMETIC_TYPES.filter((t): t is Exclude<CosmeticType, 'bundle'> => t !== 'bundle')
]

export function typeFilterLabel(filter: TypeFilter): string {
  return filter === 'all' ? 'All' : filter === 'special' ? 'Special' : TYPE_LABELS[filter]
}

function matchesTab(c: Cosmetic, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'special') return c.rarity === 'special'
  return c.type === filter
}

/** The slot an item is worn in; null for emotes (a list) and bundles (bought, never worn). */
export function slotOf(type: CosmeticType): CosmeticSlot | null {
  return type === 'emote' || type === 'bundle' ? null : type
}

export function isBundle(cosmetic: Pick<Cosmetic, 'type'>): boolean {
  return cosmetic.type === 'bundle'
}

/** Whether a cosmetic is worn/on the wheel right now. Bundles are never "equipped". */
export function isEquippedIn(
  cosmetic: Pick<Cosmetic, 'id' | 'type'>,
  equipped: EquippedMap,
  emotes: readonly string[]
): boolean {
  if (cosmetic.type === 'emote') return emotes.includes(cosmetic.id)
  const slot = slotOf(cosmetic.type)
  return slot !== null && equipped[slot] === cosmetic.id
}

/**
 * What the Equip/Unequip button does: one item per slot, so equipping replaces whatever the slot
 * held, and pressing it on the equipped item clears the slot. Null when the item is not worn.
 */
export function equipAction(
  cosmetic: Pick<Cosmetic, 'id' | 'type'>,
  equipped: EquippedMap
): { type: CosmeticSlot; id: string | null; replaces: string | null } | null {
  const slot = slotOf(cosmetic.type)
  if (!slot) return null
  const current = equipped[slot] ?? null
  if (current === cosmetic.id) return { type: slot, id: null, replaces: null }
  return { type: slot, id: cosmetic.id, replaces: current }
}

/** Slots the Equipped panel always lists (even empty) when the catalogue has something for them. */
export const PANEL_SLOTS: readonly CosmeticSlot[] = ['cape', 'shield', 'bandana']

export type BackSlot = 'cape' | 'cloak' | 'wings'

/** Cosmetics the 3D viewer can show on the player's back. */
export function isBackSlot(type: CosmeticType): type is BackSlot {
  return type === 'cape' || type === 'cloak' || type === 'wings'
}

export function backEquipment(type: CosmeticType | null): 'cape' | 'elytra' {
  return type === 'wings' ? 'elytra' : 'cape'
}

/** The id shown on the model's back when nothing is being previewed: cape, then cloak, then wings. */
export function equippedBackId(equipped: EquippedMap): string | null {
  return equipped.cape ?? equipped.cloak ?? equipped.wings ?? null
}

// ---------------------------------------------------------------------------
// Ownership and the emote wheel
// ---------------------------------------------------------------------------

/**
 * `owned` is authoritative: the main process folds free catalogue items into it, and with the
 * Shard API the page replaces it with the API's answer (see effectiveOwned in @shared/online).
 */
export function isOwned(cosmetic: Cosmetic, owned: readonly string[]): boolean {
  return owned.includes(cosmetic.id)
}

export const MAX_EMOTES = 8

/** Toggling an emote that is already on the wheel always works; adding needs a free slot. */
export function canToggleEmote(emotes: readonly string[], id: string): boolean {
  return emotes.includes(id) || emotes.length < MAX_EMOTES
}

export function toggleEmoteList(emotes: readonly string[], id: string): string[] {
  return emotes.includes(id) ? emotes.filter((e) => e !== id) : [...emotes, id]
}

// ---------------------------------------------------------------------------
// Wardrobe filters
// ---------------------------------------------------------------------------

export interface WardrobeFilters {
  query: string
  type: TypeFilter
  rarities: readonly CosmeticRarity[]
  ownedOnly: boolean
}

export const DEFAULT_FILTERS: WardrobeFilters = {
  query: '',
  type: 'all',
  rarities: [],
  ownedOnly: false
}

function cosmeticMatches(c: Cosmetic, needle: string): boolean {
  return (
    c.name.toLowerCase().includes(needle) ||
    c.author.toLowerCase().includes(needle) ||
    (c.description?.toLowerCase().includes(needle) ?? false) ||
    c.tags.some((t) => t.toLowerCase().includes(needle))
  )
}

/** Applies the wardrobe filters and sorts rarest first, then by name. */
export function filterCosmetics(
  all: readonly Cosmetic[],
  filters: WardrobeFilters,
  owned: readonly string[]
): Cosmetic[] {
  const needle = filters.query.trim().toLowerCase()
  return all
    .filter((c) => !isBundle(c))
    .filter((c) => matchesTab(c, filters.type))
    .filter((c) => filters.rarities.length === 0 || filters.rarities.includes(c.rarity))
    .filter((c) => !filters.ownedOnly || isOwned(c, owned))
    .filter((c) => needle === '' || cosmeticMatches(c, needle))
    .sort((a, b) => {
      const rank = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]
      return rank !== 0 ? rank : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}

export function countByType(all: readonly Cosmetic[]): Record<TypeFilter, number> {
  const counts = Object.fromEntries(TYPE_FILTERS.map((t) => [t, 0])) as Record<TypeFilter, number>
  for (const c of all) {
    if (c.type === 'bundle') continue
    counts.all += 1
    counts[c.type] += 1
    if (c.rarity === 'special') counts.special += 1
  }
  return counts
}

/**
 * Bundles shown above the grid: every bundle on the All tab, special bundles on the Special tab,
 * and on a type tab the bundles with an item of that type; matching the search and rarity
 * filters, and with "Owned only" just the complete ones.
 */
export function featuredBundles(
  all: readonly Cosmetic[],
  filters: WardrobeFilters,
  owned: readonly string[]
): Cosmetic[] {
  const needle = filters.query.trim().toLowerCase()
  const byId = new Map(all.map((c) => [c.id, c]))
  return all.filter((c) => {
    if (!isBundle(c)) return false
    const itemTypes = (c.items ?? []).map((id) => byId.get(id)?.type)
    if (filters.type === 'special') {
      if (c.rarity !== 'special') return false
    } else if (filters.type !== 'all' && !itemTypes.includes(filters.type)) return false
    if (filters.rarities.length > 0 && !filters.rarities.includes(c.rarity)) return false
    if (filters.ownedOnly && !isOwned(c, owned)) return false
    return needle === '' || cosmeticMatches(c, needle)
  })
}

export function toggleRarity(
  rarities: readonly CosmeticRarity[],
  rarity: CosmeticRarity
): CosmeticRarity[] {
  return rarities.includes(rarity) ? rarities.filter((r) => r !== rarity) : [...rarities, rarity]
}

// ---------------------------------------------------------------------------
// Bundle wording
// ---------------------------------------------------------------------------

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** "OhMarker Set — 2000 tokens · save 1000"; just the name once owned or when not on sale. */
export function bundleHeadline(name: string, state: BundleState): string {
  if (state.complete || state.price === null) return name
  return `${name} — ${state.price} tokens${state.saving !== null ? ` · save ${state.saving}` : ''}`
}

/** The small line next to the buy button, or null when the headline says it all. */
export function bundleNote(state: BundleState): string | null {
  if (state.complete) return 'You own everything in this set.'
  const owned = state.items.length - state.missing.length
  if (owned === 0 || state.price === null) return null
  if (state.saving !== null)
    return `Gives the ${plural(state.missing.length, 'item')} you are missing.`
  if (state.missingPrice !== null && state.missingPrice < state.price) {
    return state.missing.length === 1
      ? `You only need 1 item; it costs ${state.missingPrice} on its own.`
      : `The ${state.missing.length} items you need cost ${state.missingPrice} on their own.`
  }
  return `Same price as the ${plural(state.missing.length, 'item')} you are missing.`
}

/** The confirm dialog's message for buying a bundle. */
export function bundleConfirmMessage(
  state: BundleState,
  tokens: number,
  names: ReadonlyMap<string, string>
): string {
  const price = state.price ?? 0
  const list = state.missing.map((id) => names.get(id) ?? id).join(', ')
  let text = `It costs ${price} tokens and gives you ${list}. You will have ${tokens - price} left.`
  if (state.missingPrice !== null && state.missingPrice < price) {
    text += ` Buying ${state.missing.length === 1 ? 'it' : 'them'} one by one costs ${state.missingPrice}.`
  }
  return text
}
