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
  /** Outer glow, only for the top tier. */
  glow: string | null
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
  mythic: { label: 'Mythic', color: '#fb7185' }
}

export const RARITY_PALETTE: Record<CosmeticRarity, RarityStyle> = Object.fromEntries(
  COSMETIC_RARITIES.map((rarity) => {
    const { label, color } = base[rarity]
    const style: RarityStyle = {
      label,
      color,
      soft: rgba(color, 0.16),
      border: rgba(color, 0.35),
      glow: rarity === 'mythic' ? `0 0 18px ${rgba(color, 0.55)}` : null
    }
    return [rarity, style]
  })
) as Record<CosmeticRarity, RarityStyle>

/** Higher is rarer. */
export const RARITY_RANK: Record<CosmeticRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4
}

/** Fallback tile background when a cosmetic has no 2D preview image. */
export function gradientFor(rarity: CosmeticRarity): string {
  const { color } = RARITY_PALETTE[rarity]
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
  emote: 'Emote'
}

export type TypeFilter = 'all' | CosmeticType

export const TYPE_FILTERS: readonly TypeFilter[] = ['all', ...COSMETIC_TYPES]

export function slotOf(type: CosmeticType): CosmeticSlot | null {
  return type === 'emote' ? null : type
}

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
    .filter((c) => filters.type === 'all' || c.type === filters.type)
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
    counts.all += 1
    counts[c.type] += 1
  }
  return counts
}

export function toggleRarity(
  rarities: readonly CosmeticRarity[],
  rarity: CosmeticRarity
): CosmeticRarity[] {
  return rarities.includes(rarity) ? rarities.filter((r) => r !== rarity) : [...rarities, rarity]
}
