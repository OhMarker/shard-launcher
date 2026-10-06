import { MIN_MINECRAFT_VERSION } from './constants'

/**
 * Minecraft release ids look like "1.21", "1.21.1", "1.21.10", "1.22".
 * Snapshots ("24w33a", "1.21.2-pre1", "1.21.2-rc1") have no semantic form and
 * are ordered by release time instead.
 */
const RELEASE_RE = /^(\d+)\.(\d+)(?:\.(\d+))?$/

export function parseReleaseVersion(id: string): number[] | null {
  const m = RELEASE_RE.exec(id.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), m[3] !== undefined ? Number(m[3]) : 0]
}

export function compareReleaseVersions(a: string, b: string): number {
  const pa = parseReleaseVersion(a)
  const pb = parseReleaseVersion(b)
  if (!pa || !pb) {
    if (pa && !pb) return 1
    if (!pa && pb) return -1
    return a.localeCompare(b)
  }
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** True for release ids >= 1.21. Snapshots and anything unparseable return false. */
export function isSupportedRelease(id: string): boolean {
  if (!parseReleaseVersion(id)) return false
  return compareReleaseVersions(id, MIN_MINECRAFT_VERSION) >= 0
}

export interface ManifestVersionLike {
  id: string
  type: string
  releaseTime: string
}

export interface FilterOptions {
  includeSnapshots: boolean
}

/**
 * Applies the version support rule to a Mojang manifest:
 * releases must be semantically >= 1.21; snapshots must be newer than the 1.21
 * release itself and are only included when the user asks for them.
 * Output is newest first.
 */
export function filterSupportedVersions<T extends ManifestVersionLike>(
  versions: readonly T[],
  options: FilterOptions
): T[] {
  const baseline = versions.find((v) => v.id === MIN_MINECRAFT_VERSION && v.type === 'release')
  const baselineTime = baseline ? Date.parse(baseline.releaseTime) : null

  const out = versions.filter((v) => {
    if (v.type === 'release') return isSupportedRelease(v.id)
    if (!options.includeSnapshots) return false
    if (v.type !== 'snapshot') return false
    if (baselineTime === null) return false
    return Date.parse(v.releaseTime) > baselineTime
  })

  out.sort((a, b) => Date.parse(b.releaseTime) - Date.parse(a.releaseTime))
  return out
}

/** Major Java version a Minecraft version needs when the version JSON does not say. */
export function fallbackJavaMajor(_minecraftVersion: string): number {
  // Every supported version (>= 1.21) requires Java 21 or newer. The real value
  // always comes from the version JSON; this only guards against malformed metadata.
  return 21
}

/** Picks the newest build whose `minecraft` list contains the given version. */
export function pickBuildForVersion<T extends { version: string; minecraft: string[] }>(
  builds: readonly T[],
  minecraftVersion: string
): T | null {
  const matching = builds.filter((b) => b.minecraft.includes(minecraftVersion))
  if (matching.length === 0) return null
  matching.sort((a, b) => compareLooseSemver(b.version, a.version))
  return matching[0] ?? null
}

/** Loose semver comparison tolerant of prerelease suffixes (1.0.0-beta.2). */
export function compareLooseSemver(a: string, b: string): number {
  const split = (v: string): { nums: number[]; pre: string } => {
    const [core, pre = ''] = v.split('-', 2)
    const nums = (core ?? '')
      .split('.')
      .map((n) => Number.parseInt(n, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
    while (nums.length < 3) nums.push(0)
    return { nums, pre }
  }
  const pa = split(a)
  const pb = split(b)
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (d !== 0) return d
  }
  if (pa.pre === pb.pre) return 0
  if (pa.pre === '') return 1
  if (pb.pre === '') return -1
  return pa.pre.localeCompare(pb.pre)
}
