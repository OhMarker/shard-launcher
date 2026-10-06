import {
  type BundledModsManifest,
  type InstalledMod,
  type InstanceModsView,
  type InstanceSummary,
  type ModrinthGalleryItem,
  type ModrinthSortIndex,
  type ModrinthVersion,
  type ModsProgress
} from '@shared/types'

// ---------------------------------------------------------------------------
// Your Mods: filtering and sorting
// ---------------------------------------------------------------------------

export type YourModsSort = 'name' | 'updated'

export const YOUR_MODS_SORTS: ReadonlyArray<{ value: YourModsSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Updates first' }
]

function modMatches(mod: InstalledMod, needle: string): boolean {
  const haystack = [
    mod.name,
    mod.fileName,
    mod.version,
    mod.modrinth?.title,
    mod.modrinth?.author,
    mod.modrinth?.slug,
    mod.fabric?.id
  ]
  return haystack.some((h) => h?.toLowerCase().includes(needle))
}

const byName = (a: InstalledMod, b: InstalledMod): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/**
 * Filters the user's mods by a free-text query and sorts them. "updated" puts mods with a
 * pending update first (newest update first), then the rest alphabetically.
 */
export function filterAndSortMods(
  mods: readonly InstalledMod[],
  query: string,
  sort: YourModsSort
): InstalledMod[] {
  const needle = query.trim().toLowerCase()
  const list = needle ? mods.filter((m) => modMatches(m, needle)) : [...mods]
  if (sort === 'name') return list.sort(byName)
  return list.sort((a, b) => {
    if ((a.update !== null) !== (b.update !== null)) return a.update ? -1 : 1
    if (a.update && b.update) {
      const d = Date.parse(b.update.datePublished) - Date.parse(a.update.datePublished)
      if (Number.isFinite(d) && d !== 0) return d
    }
    return byName(a, b)
  })
}

export function countUpdates(mods: readonly InstalledMod[]): number {
  return mods.filter((m) => m.update !== null).length
}

// ---------------------------------------------------------------------------
// Installed state lookups
// ---------------------------------------------------------------------------

/** Every jar the instance currently has: user mods, installed Shard Core mods and the client. */
export function allInstalledMods(view: InstanceModsView): InstalledMod[] {
  const core = view.core.map((c) => c.installed).filter((m): m is InstalledMod => m !== null)
  return [...view.yours, ...core, ...(view.shard.mod ? [view.shard.mod] : [])]
}

export function installedVersionIds(view: InstanceModsView): Set<string> {
  const ids = new Set<string>()
  for (const mod of allInstalledMods(view)) if (mod.modrinth) ids.add(mod.modrinth.versionId)
  return ids
}

export type HitState = 'install' | 'installed' | 'core' | 'conflict'

/** What the Install button on a Modrinth search hit should say for this instance. */
export function hitState(
  hit: { projectId: string; slug: string },
  view: InstanceModsView
): HitState {
  if (view.manifest.mods.some((d) => d.slug === hit.slug)) return 'core'
  if (view.core.some((c) => c.installed?.modrinth?.projectId === hit.projectId)) return 'core'
  if (view.manifest.conflicts.some((c) => c.slug === hit.slug)) return 'conflict'
  if (allInstalledMods(view).some((m) => m.modrinth?.projectId === hit.projectId))
    return 'installed'
  return 'install'
}

export function conflictReasonForSlug(slug: string, manifest: BundledModsManifest): string | null {
  return manifest.conflicts.find((c) => c.slug === slug)?.reason ?? null
}

/** Why an installed mod is flagged as conflicting, from the bundled manifest when it knows. */
export function conflictReason(mod: InstalledMod, manifest: BundledModsManifest): string | null {
  const candidates = [mod.modrinth?.slug, mod.fabric?.id].filter((s): s is string => !!s)
  for (const slug of candidates) {
    const reason = conflictReasonForSlug(slug, manifest)
    if (reason) return reason
  }
  return mod.status === 'conflict' ? 'Known to conflict with Shard Core.' : null
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function instanceLabel(
  instance: Pick<InstanceSummary, 'name' | 'minecraftVersion'>
): string {
  return `${instance.name} · ${instance.minecraftVersion}`
}

export function splitImportPaths(paths: readonly string[]): {
  jars: string[]
  mrpacks: string[]
  other: string[]
} {
  const jars: string[] = []
  const mrpacks: string[] = []
  const other: string[] = []
  for (const p of paths) {
    const lower = p.toLowerCase()
    if (lower.endsWith('.jar')) jars.push(p)
    else if (lower.endsWith('.mrpack')) mrpacks.push(p)
    else other.push(p)
  }
  return { jars, mrpacks, other }
}

export function modrinthModUrl(slug: string): string {
  return `https://modrinth.com/mod/${encodeURIComponent(slug)}`
}

/** Up to two letters for an icon placeholder: "Fabric API" -> "FA", "Sodium" -> "SO". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]!
  const second = words.length > 1 ? words[1]!.charAt(0) : first.charAt(1)
  return (first.charAt(0) + second).toUpperCase()
}

export function progressPercent(progress: ModsProgress): number | null {
  if (progress.total <= 0) return null
  return Math.max(0, Math.min(100, (progress.current / progress.total) * 100))
}

// ---------------------------------------------------------------------------
// Modrinth browsing
// ---------------------------------------------------------------------------

export const MODRINTH_SORTS: ReadonlyArray<{ value: ModrinthSortIndex; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'follows', label: 'Follows' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
]

export const MODRINTH_CATEGORIES: readonly string[] = [
  'optimization',
  'utility',
  'adventure',
  'library',
  'cursed',
  'decoration',
  'equipment',
  'food',
  'game-mechanics',
  'magic',
  'management',
  'minigame',
  'mobs',
  'social',
  'storage',
  'technology',
  'transportation',
  'world-generation'
]

export function categoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Featured images first; otherwise keeps Modrinth's order (sort is stable). */
export function sortGallery(gallery: readonly ModrinthGalleryItem[]): ModrinthGalleryItem[] {
  return [...gallery].sort((a, b) => Number(b.featured) - Number(a.featured))
}

/** Versions that run on the instance's Minecraft version, newest first. */
export function versionsForGame(
  versions: readonly ModrinthVersion[],
  gameVersion: string
): ModrinthVersion[] {
  return versions
    .filter((v) => v.gameVersions.includes(gameVersion))
    .sort((a, b) => {
      const d = Date.parse(b.datePublished) - Date.parse(a.datePublished)
      return Number.isFinite(d) ? d : 0
    })
}

export function nextSearchOffset(page: {
  offset: number
  limit: number
  totalHits: number
  hits: readonly unknown[]
}): number | undefined {
  if (page.hits.length === 0) return undefined
  const next = page.offset + page.hits.length
  return next < page.totalHits ? next : undefined
}
