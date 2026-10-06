import {
  type MinecraftProfile,
  type ProfileCape,
  type ProfileSkin,
  type SavedSkin,
  type SkinVariant
} from '@shared/types'

/** Favorites first, then newest first, then by name so the order is total. */
export function sortSkins(skins: readonly SavedSkin[]): SavedSkin[] {
  return [...skins].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    const d = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (Number.isFinite(d) && d !== 0) return d
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

export function activeSkin(profile: MinecraftProfile | null | undefined): ProfileSkin | null {
  return profile?.skins.find((s) => s.state === 'ACTIVE') ?? null
}

export function activeCape(profile: MinecraftProfile | null | undefined): ProfileCape | null {
  return profile?.capes.find((c) => c.state === 'ACTIVE') ?? null
}

export function toVariant(variant: ProfileSkin['variant']): SkinVariant {
  return variant === 'SLIM' ? 'slim' : 'classic'
}

export function variantLabel(variant: SkinVariant): string {
  return variant === 'slim' ? 'Slim' : 'Classic'
}

/** Optimistic profile after `skins:setCape`: exactly one cape ACTIVE, or none. */
export function withCapeActive(profile: MinecraftProfile, capeId: string | null): MinecraftProfile {
  return {
    ...profile,
    capes: profile.capes.map((c) => ({ ...c, state: c.id === capeId ? 'ACTIVE' : 'INACTIVE' }))
  }
}

/**
 * Pixels that exist in the 4px-wide classic right arm but not in the 3px slim one. A skin whose
 * pixels there are all fully transparent was painted for the slim model.
 */
const SLIM_PROBES: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 50, y: 16, w: 2, h: 4 },
  { x: 54, y: 20, w: 2, h: 12 }
]

/**
 * Infers the arm model from RGBA pixel data of a 64x64 (or legacy 64x32) skin.
 * Returns null when the texture has unexpected dimensions.
 */
export function detectSlim(data: ArrayLike<number>, width: number, height: number): boolean | null {
  if (width !== 64 || (height !== 64 && height !== 32)) return null
  if (data.length < width * height * 4) return null
  for (const probe of SLIM_PROBES) {
    for (let y = probe.y; y < probe.y + probe.h; y++) {
      for (let x = probe.x; x < probe.x + probe.w; x++) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (alpha !== 0) return false
      }
    }
  }
  return true
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Mojang usernames: 1-16 characters, letters, digits and underscores. */
export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9_]{1,16}$/.test(value.trim())
}

/** Cape textures use the 64x32 layout; the front face of the cape is the 10x16 block at (1,1). */
export const CAPE_FRONT = { x: 1, y: 1, w: 10, h: 16 } as const
