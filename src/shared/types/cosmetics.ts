export type CosmeticType = 'cape' | 'cloak' | 'hat' | 'wings' | 'bandana' | 'backbling' | 'emote'
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type CosmeticAvailability = 'free' | 'locked'

export const COSMETIC_TYPES: readonly CosmeticType[] = [
  'cape',
  'cloak',
  'hat',
  'wings',
  'bandana',
  'backbling',
  'emote'
]

export const COSMETIC_RARITIES: readonly CosmeticRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic'
]

export interface Cosmetic {
  id: string
  type: CosmeticType
  name: string
  rarity: CosmeticRarity
  /** Texture the Shard client renders. Capes/cloaks/wings use the 64x32 cape layout. */
  textureUrl: string
  /** Optional 2D preview card image. */
  previewUrl: string | null
  animated: boolean
  author: string
  description: string | null
  availability: CosmeticAvailability
  tags: string[]
}

export interface CosmeticsManifest {
  schemaVersion: number
  updatedAt: string
  cosmetics: Cosmetic[]
}

/** Slots that hold one cosmetic each. Emotes are a list. */
export type CosmeticSlot = Exclude<CosmeticType, 'emote'>
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
