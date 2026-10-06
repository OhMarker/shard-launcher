import type { ModrinthVersion, ModrinthVersionType } from '@shared/types'

export const FABRIC_LOADER = 'fabric'

const TIER: Record<ModrinthVersionType, number> = { release: 0, beta: 1, alpha: 2 }

export function isCompatible(version: ModrinthVersion, gameVersion: string, loader = FABRIC_LOADER): boolean {
  return version.loaders.includes(loader) && version.gameVersions.includes(gameVersion)
}

function publishedAt(version: ModrinthVersion): number {
  const t = Date.parse(version.datePublished)
  return Number.isFinite(t) ? t : 0
}

/** Negative when `a` should be preferred over `b`: stabler channel first, then newest. */
export function compareVersionPreference(a: ModrinthVersion, b: ModrinthVersion): number {
  const tier = TIER[a.versionType] - TIER[b.versionType]
  if (tier !== 0) return tier
  return publishedAt(b) - publishedAt(a)
}

/**
 * Newest Fabric version for the game version, preferring releases over betas over alphas.
 * Returns null when nothing supports the game version yet.
 */
export function pickLatestCompatible(versions: ModrinthVersion[], gameVersion: string): ModrinthVersion | null {
  let best: ModrinthVersion | null = null
  for (const version of versions) {
    if (!isCompatible(version, gameVersion)) continue
    if (!best || compareVersionPreference(version, best) < 0) best = version
  }
  return best
}
