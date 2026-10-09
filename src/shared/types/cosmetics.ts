export type CosmeticType =
  'cape' | 'cloak' | 'hat' | 'wings' | 'bandana' | 'backbling' | 'shield' | 'emote' | 'bundle'
/** `special` is for limited event items (Halloween and the like); it sorts above mythic. */
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'special'
export type CosmeticAvailability = 'free' | 'locked'

export const COSMETIC_TYPES: readonly CosmeticType[] = [
  'cape',
  'cloak',
  'hat',
  'wings',
  'bandana',
  'backbling',
  'shield',
  'emote',
  'bundle'
]

export const COSMETIC_RARITIES: readonly CosmeticRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'special'
]

export interface Cosmetic {
  id: string
  type: CosmeticType
  name: string
  rarity: CosmeticRarity
  /**
   * Texture the Shard client renders. Capes/cloaks/wings use the 64x32 cape layout. Null only for
   * bundles, which are sold as a set of other cosmetics and have nothing to render.
   */
  textureUrl: string | null
  /** Optional 2D preview card image. */
  previewUrl: string | null
  animated: boolean
  author: string
  description: string | null
  availability: CosmeticAvailability
  tags: string[]
  /** Bundles only: the ids of the cosmetics the bundle gives. */
  items?: string[]
}

export interface CosmeticsManifest {
  schemaVersion: number
  updatedAt: string
  cosmetics: Cosmetic[]
}

/** Slots that hold one cosmetic each. Emotes are a list; bundles are bought, never worn. */
export type CosmeticSlot = Exclude<CosmeticType, 'emote' | 'bundle'>

/** Slots the Shard API stores and shows to other players (shard-api/API.md, POST /v1/equip). */
export type OnlineSlot = 'cape' | 'shield' | 'bandana'
export const ONLINE_SLOTS: readonly OnlineSlot[] = ['cape', 'shield', 'bandana']
export type EquippedMap = Partial<Record<CosmeticSlot, string>>

/** Written to <data>/cosmetics/equipped.json. The Shard client reads this at runtime. */
export interface EquippedCosmetics {
  schemaVersion: 1
  updatedAt: string
  accountId: string | null
  equipped: EquippedMap
  emotes: string[]
}

export interface CosmeticsView {
  manifest: CosmeticsManifest
  owned: string[]
  equipped: EquippedCosmetics
  source: 'remote' | 'cache' | 'bundled'
  /** Cosmetic id -> data URL of its texture, for live preview in the 3D viewer. */
  textures: Record<string, string>
  /** Cosmetic id -> data URL of its 2D preview image, when one exists. */
  previews: Record<string, string>
}
