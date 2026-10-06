/**
 * Pure cosmetics rules: ownership, equip/unequip validation, emote toggling, pruning and
 * texture URL resolution. No Electron, no file system, so Vitest can cover every branch.
 */
import { ShardError } from '@shared/errors'
import { type CosmeticsManifestPayload } from '@shared/schemas/shard'
import {
  COSMETIC_TYPES,
  type Cosmetic,
  type CosmeticRarity,
  type CosmeticSlot,
  type CosmeticType,
  type CosmeticsManifest,
  type EquippedCosmetics,
  type EquippedMap
} from '@shared/types'

export const MAX_EMOTES = 8

/** Cosmetic types rendered on the player's back with the 64x32 cape texture layout. */
export const CAPE_LAYOUT_TYPES: ReadonlySet<CosmeticType> = new Set<CosmeticType>(['cape', 'cloak', 'wings'])

export const COSMETIC_SLOTS: readonly CosmeticSlot[] = COSMETIC_TYPES.filter(
  (type): type is CosmeticSlot => type !== 'emote'
)

function isSlot(value: string): value is CosmeticSlot {
  return (COSMETIC_SLOTS as readonly string[]).includes(value)
}

/**
 * The schema enums are built from COSMETIC_TYPES / COSMETIC_RARITIES, so every validated
 * string is already a member of the unions; only the static type needs narrowing.
 */
export function toCosmeticsManifest(payload: CosmeticsManifestPayload): CosmeticsManifest {
  return {
    schemaVersion: payload.schemaVersion,
    updatedAt: payload.updatedAt,
    cosmetics: payload.cosmetics.map((cosmetic) => ({
      ...cosmetic,
      type: cosmetic.type as CosmeticType,
      rarity: cosmetic.rarity as CosmeticRarity
    }))
  }
}

export function defaultEquipped(now: string): EquippedCosmetics {
  return { schemaVersion: 1, updatedAt: now, accountId: null, equipped: {}, emotes: [] }
}

/** equipped.json as validated by EquippedCosmeticsSchema; `equipped` keys are not yet narrowed to slots. */
export interface EquippedPayload {
  schemaVersion: 1
  updatedAt: string
  accountId: string | null
  equipped: Record<string, string>
  emotes: string[]
}

/** Drops unknown slot names so a hand-edited or newer file cannot smuggle in extra keys. */
export function normalizeEquipped(payload: EquippedPayload): EquippedCosmetics {
  const equipped: EquippedMap = {}
  for (const [slot, id] of Object.entries(payload.equipped)) {
    if (isSlot(slot) && id.length > 0) equipped[slot] = id
  }
  return {
    schemaVersion: 1,
    updatedAt: payload.updatedAt,
    accountId: payload.accountId,
    equipped,
    emotes: [...new Set(payload.emotes)].slice(0, MAX_EMOTES)
  }
}

/** Free cosmetics plus explicitly unlocked ids, in manifest order and without duplicates. */
export function ownedIds(manifest: Pick<CosmeticsManifest, 'cosmetics'>, unlocked: readonly string[]): string[] {
  const unlockedSet = new Set(unlocked)
  return manifest.cosmetics
    .filter((cosmetic) => cosmetic.availability === 'free' || unlockedSet.has(cosmetic.id))
    .map((cosmetic) => cosmetic.id)
}

function findCosmetic(manifest: Pick<CosmeticsManifest, 'cosmetics'>, id: string): Cosmetic {
  const cosmetic = manifest.cosmetics.find((candidate) => candidate.id === id)
  if (!cosmetic) throw new ShardError('NOT_FOUND', `Unknown cosmetic "${id}"`)
  return cosmetic
}

function assertOwned(cosmetic: Cosmetic, owned: ReadonlySet<string>): void {
  if (!owned.has(cosmetic.id)) {
    throw new ShardError('INVALID_INPUT', 'You do not own this cosmetic yet', {
      details: { id: cosmetic.id, rarity: cosmetic.rarity }
    })
  }
}

/**
 * Equips `id` into `slot` (or clears the slot when `id` is null). Capes and cloaks both render
 * on the back, so equipping one clears the other.
 */
export function applyEquip(
  state: EquippedCosmetics,
  manifest: Pick<CosmeticsManifest, 'cosmetics'>,
  owned: ReadonlySet<string>,
  slot: CosmeticSlot,
  id: string | null,
  now: string
): EquippedCosmetics {
  const equipped: EquippedMap = { ...state.equipped }
  if (id === null) {
    delete equipped[slot]
    return { ...state, equipped, updatedAt: now }
  }
  const cosmetic = findCosmetic(manifest, id)
  if (cosmetic.type !== slot) {
    throw new ShardError('INVALID_INPUT', `${cosmetic.name} is a ${cosmetic.type}, not a ${slot}`, {
      details: { id, type: cosmetic.type, slot }
    })
  }
  assertOwned(cosmetic, owned)
  equipped[slot] = id
  if (slot === 'cape') delete equipped.cloak
  if (slot === 'cloak') delete equipped.cape
  return { ...state, equipped, updatedAt: now }
}

/** Adds the emote to the wheel, or removes it when already present. Removal never fails. */
export function applyToggleEmote(
  state: EquippedCosmetics,
  manifest: Pick<CosmeticsManifest, 'cosmetics'>,
  owned: ReadonlySet<string>,
  id: string,
  now: string
): EquippedCosmetics {
  if (state.emotes.includes(id)) {
    return { ...state, emotes: state.emotes.filter((emote) => emote !== id), updatedAt: now }
  }
  const cosmetic = findCosmetic(manifest, id)
  if (cosmetic.type !== 'emote') {
    throw new ShardError('INVALID_INPUT', `${cosmetic.name} is a ${cosmetic.type}, not an emote`, {
      details: { id, type: cosmetic.type }
    })
  }
  assertOwned(cosmetic, owned)
  if (state.emotes.length >= MAX_EMOTES) {
    throw new ShardError('INVALID_INPUT', `You can equip up to ${MAX_EMOTES} emotes`, {
      details: { max: MAX_EMOTES }
    })
  }
  return { ...state, emotes: [...state.emotes, id], updatedAt: now }
}

/**
 * Launch-time cleanup: records the account, drops ids the manifest no longer lists and slot
 * entries whose cosmetic type does not match the slot. Returns the same object when nothing changed.
 */
export function pruneEquipped(
  state: EquippedCosmetics,
  manifest: Pick<CosmeticsManifest, 'cosmetics'>,
  accountId: string | null,
  now: string
): EquippedCosmetics {
  const byId = new Map(manifest.cosmetics.map((cosmetic) => [cosmetic.id, cosmetic]))
  const equipped: EquippedMap = {}
  let changed = state.accountId !== accountId
  for (const slot of COSMETIC_SLOTS) {
    const id = state.equipped[slot]
    if (id === undefined) continue
    if (byId.get(id)?.type === slot) equipped[slot] = id
    else changed = true
  }
  const emotes = state.emotes.filter((id) => byId.get(id)?.type === 'emote')
  if (emotes.length !== state.emotes.length) changed = true
  if (!changed) return state
  return { ...state, accountId, equipped, emotes, updatedAt: now }
}

export type ResolvedAsset = { kind: 'bundled'; relativePath: string } | { kind: 'remote'; url: string }

const BUNDLED_SCHEME = 'bundled://'

/**
 * `bundled://cosmetics/textures/x.png` points inside the launcher's resources folder;
 * http(s) URLs are downloaded and cached. Every other scheme is rejected.
 */
export function resolveAssetUrl(url: string): ResolvedAsset {
  if (url.startsWith(BUNDLED_SCHEME)) {
    const relativePath = url.slice(BUNDLED_SCHEME.length)
    const segments = relativePath.split('/')
    if (relativePath === '' || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new ShardError('MANIFEST_INVALID', `Invalid bundled cosmetic path "${url}"`)
    }
    return { kind: 'bundled', relativePath }
  }
  if (/^https?:\/\//i.test(url)) return { kind: 'remote', url }
  throw new ShardError('MANIFEST_INVALID', `Unsupported cosmetic URL "${url}"`)
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from the IHDR chunk, or null when the buffer is not a PNG. */
export function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}
