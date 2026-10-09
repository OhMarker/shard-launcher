import { beforeAll, describe, expect, it } from 'vitest'
import { COSMETIC_RARITIES, COSMETIC_TYPES } from '@shared/types'
import type {
  Cosmetic,
  CosmeticRarity,
  CosmeticSlot,
  CosmeticType,
  EquippedMap
} from '@shared/types'

/** See mods-utils.test.ts for why the module is loaded through a runtime specifier. */
interface RarityStyle {
  label: string
  color: string
  soft: string
  border: string
  glow: string | null
}
type TypeFilter = 'all' | 'special' | CosmeticType
interface WardrobeFilters {
  query: string
  type: TypeFilter
  rarities: readonly CosmeticRarity[]
  ownedOnly: boolean
}
interface CosmeticsUtils {
  RARITY_PALETTE: Record<CosmeticRarity, RarityStyle>
  RARITY_RANK: Record<CosmeticRarity, number>
  gradientFor: (rarity: CosmeticRarity) => string
  TYPE_LABELS: Record<CosmeticType, string>
  TYPE_FILTERS: readonly TypeFilter[]
  slotOf: (type: CosmeticType) => CosmeticSlot | null
  isBackSlot: (type: CosmeticType) => boolean
  backEquipment: (type: CosmeticType | null) => 'cape' | 'elytra'
  equippedBackId: (equipped: EquippedMap) => string | null
  isOwned: (cosmetic: Cosmetic, owned: readonly string[]) => boolean
  MAX_EMOTES: number
  canToggleEmote: (emotes: readonly string[], id: string) => boolean
  toggleEmoteList: (emotes: readonly string[], id: string) => string[]
  DEFAULT_FILTERS: WardrobeFilters
  filterCosmetics: (
    all: readonly Cosmetic[],
    filters: WardrobeFilters,
    owned: readonly string[]
  ) => Cosmetic[]
  countByType: (all: readonly Cosmetic[]) => Record<TypeFilter, number>
  toggleRarity: (rarities: readonly CosmeticRarity[], rarity: CosmeticRarity) => CosmeticRarity[]
}

const specifier = '../src/renderer/src/pages/cosmetics/cosmetics-utils'
let u: CosmeticsUtils

beforeAll(async () => {
  u = (await import(specifier)) as CosmeticsUtils
})

function cosmetic(
  overrides: Partial<Cosmetic> & { id: string; type: CosmeticType; rarity: CosmeticRarity }
): Cosmetic {
  return {
    name: overrides.id,
    textureUrl: `https://example.com/${overrides.id}.png`,
    previewUrl: null,
    animated: false,
    author: 'Shard',
    description: null,
    availability: 'free',
    tags: [],
    ...overrides
  }
}

const all: Cosmetic[] = [
  cosmetic({
    id: 'crystal-cape',
    type: 'cape',
    rarity: 'epic',
    name: 'Crystal Cape',
    tags: ['pvp']
  }),
  cosmetic({ id: 'plain-cape', type: 'cape', rarity: 'common', name: 'Plain Cape' }),
  cosmetic({
    id: 'phoenix-wings',
    type: 'wings',
    rarity: 'mythic',
    name: 'Phoenix Wings',
    availability: 'locked',
    animated: true
  }),
  cosmetic({
    id: 'top-hat',
    type: 'hat',
    rarity: 'rare',
    name: 'Top Hat',
    availability: 'locked',
    author: 'Milliner'
  }),
  cosmetic({ id: 'wave', type: 'emote', rarity: 'common', name: 'Wave', description: 'Say hello' })
]

describe('cosmetics-utils: palette', () => {
  it('defines a style for every rarity with valid hex colours', () => {
    for (const rarity of COSMETIC_RARITIES) {
      const style = u.RARITY_PALETTE[rarity]
      expect(style.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(style.soft).toMatch(/^rgba\(/)
      expect(style.border).toMatch(/^rgba\(/)
      expect(style.label.length).toBeGreaterThan(0)
    }
    expect(u.RARITY_PALETTE.epic.color).toBe('#a78bfa')
    expect(u.RARITY_PALETTE.mythic.glow).not.toBeNull()
    expect(u.RARITY_PALETTE.common.glow).toBeNull()
  })

  it('ranks rarities in ascending order', () => {
    const ranks = COSMETIC_RARITIES.map((r) => u.RARITY_RANK[r])
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('builds a gradient from the rarity colour', () => {
    expect(u.gradientFor('legendary')).toContain('rgba(251, 191, 36')
    expect(u.gradientFor('legendary')).toMatch(/^linear-gradient\(/)
  })
})

describe('cosmetics-utils: types and slots', () => {
  it('labels every type and lists the filters', () => {
    for (const type of COSMETIC_TYPES) expect(u.TYPE_LABELS[type].length).toBeGreaterThan(0)
    expect(u.TYPE_FILTERS).toEqual(['all', 'special', ...COSMETIC_TYPES.filter((t) => t !== 'bundle')])
  })

  it('maps types to slots and back equipment', () => {
    expect(u.slotOf('emote')).toBeNull()
    expect(u.slotOf('hat')).toBe('hat')
    expect(u.isBackSlot('cape')).toBe(true)
    expect(u.isBackSlot('cloak')).toBe(true)
    expect(u.isBackSlot('wings')).toBe(true)
    expect(u.isBackSlot('hat')).toBe(false)
    expect(u.backEquipment('wings')).toBe('elytra')
    expect(u.backEquipment('cape')).toBe('cape')
    expect(u.backEquipment(null)).toBe('cape')
  })

  it('prefers cape, then cloak, then wings on the back', () => {
    expect(u.equippedBackId({ cape: 'c', cloak: 'k', wings: 'w' })).toBe('c')
    expect(u.equippedBackId({ cloak: 'k', wings: 'w' })).toBe('k')
    expect(u.equippedBackId({ wings: 'w', hat: 'h' })).toBe('w')
    expect(u.equippedBackId({ hat: 'h' })).toBeNull()
  })
})

describe('cosmetics-utils: ownership and emotes', () => {
  it('trusts the owned list (main folds free items in; the Shard API decides when signed in)', () => {
    expect(u.isOwned(all[0]!, [])).toBe(false)
    expect(u.isOwned(all[0]!, [all[0]!.id])).toBe(true)
    expect(u.isOwned(all[2]!, [])).toBe(false)
    expect(u.isOwned(all[2]!, ['phoenix-wings'])).toBe(true)
  })

  it('enforces the emote wheel limit', () => {
    const full = Array.from({ length: u.MAX_EMOTES }, (_, i) => `e${i}`)
    expect(u.MAX_EMOTES).toBe(8)
    expect(u.canToggleEmote(full, 'new')).toBe(false)
    expect(u.canToggleEmote(full, 'e3')).toBe(true)
    expect(u.canToggleEmote(full.slice(1), 'new')).toBe(true)
    expect(u.toggleEmoteList(['a', 'b'], 'b')).toEqual(['a'])
    expect(u.toggleEmoteList(['a'], 'b')).toEqual(['a', 'b'])
  })
})

describe('cosmetics-utils: wardrobe filters', () => {
  it('returns everything sorted rarest first by default', () => {
    expect(u.filterCosmetics(all, u.DEFAULT_FILTERS, []).map((c) => c.id)).toEqual([
      'phoenix-wings',
      'crystal-cape',
      'top-hat',
      'plain-cape',
      'wave'
    ])
  })

  it('filters by type, rarity, ownership and query', () => {
    expect(
      u.filterCosmetics(all, { ...u.DEFAULT_FILTERS, type: 'cape' }, []).map((c) => c.id)
    ).toEqual(['crystal-cape', 'plain-cape'])
    expect(
      u
        .filterCosmetics(all, { ...u.DEFAULT_FILTERS, rarities: ['mythic', 'rare'] }, [])
        .map((c) => c.id)
    ).toEqual(['phoenix-wings', 'top-hat'])
    expect(
      u
        .filterCosmetics(all, { ...u.DEFAULT_FILTERS, ownedOnly: true }, ['crystal-cape', 'top-hat', 'plain-cape', 'wave'])
        .map((c) => c.id)
    ).toEqual(['crystal-cape', 'top-hat', 'plain-cape', 'wave'])
    expect(
      u.filterCosmetics(all, { ...u.DEFAULT_FILTERS, query: 'PVP' }, []).map((c) => c.id)
    ).toEqual(['crystal-cape'])
    expect(
      u.filterCosmetics(all, { ...u.DEFAULT_FILTERS, query: 'milliner' }, []).map((c) => c.id)
    ).toEqual(['top-hat'])
    expect(
      u.filterCosmetics(all, { ...u.DEFAULT_FILTERS, query: 'hello' }, []).map((c) => c.id)
    ).toEqual(['wave'])
    expect(u.filterCosmetics(all, { ...u.DEFAULT_FILTERS, query: 'zzz' }, [])).toEqual([])
  })

  it('counts cosmetics per type including the total', () => {
    const counts = u.countByType(all)
    expect(counts.all).toBe(5)
    expect(counts.cape).toBe(2)
    expect(counts.wings).toBe(1)
    expect(counts.hat).toBe(1)
    expect(counts.emote).toBe(1)
    expect(counts.cloak).toBe(0)
    expect(counts.bandana).toBe(0)
    expect(counts.backbling).toBe(0)
  })

  it('toggles rarity chips immutably', () => {
    const list: CosmeticRarity[] = ['rare']
    expect(u.toggleRarity(list, 'epic')).toEqual(['rare', 'epic'])
    expect(u.toggleRarity(list, 'rare')).toEqual([])
    expect(list).toEqual(['rare'])
  })
})
