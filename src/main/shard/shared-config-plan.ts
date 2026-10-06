/**
 * Pure decision logic for the shared config layer. No file system access here so the rules
 * can be unit-tested with fake stat results; `shared-config.ts` does the copying.
 */
import { type BundledModsManifest, type Instance } from '@shared/types'

/** Two files whose mtimes differ by less than this are treated as equal (FAT/exFAT granularity). */
export const MTIME_TOLERANCE_MS = 1000

export type SyncDirection = 'in' | 'out'

export interface SyncEntry {
  /** Path relative to both the instance folder and the shared folder, forward slashes. */
  rel: string
  /** mtime of the copy in the shared layer, or null when it does not exist. */
  sharedMtimeMs: number | null
  /** mtime of the copy inside the instance, or null when it does not exist. */
  instanceMtimeMs: number | null
}

export interface SharedFileSelection {
  files: string[]
  /** Manifest entries that were dropped because they could escape the instance folder. */
  rejected: string[]
}

/** The layer is active only for Shard instances that have not opted out while the global switch is on. */
export function isSharedConfigEnabled(
  globalEnabled: boolean,
  instance: Pick<Instance, 'type' | 'settings'>
): boolean {
  return globalEnabled && instance.type === 'shard' && instance.settings.sharedConfig
}

/**
 * Normalises a manifest path to forward slashes and rejects anything that is absolute or
 * contains `.`/`..`/empty segments. Returns null for rejected entries.
 */
export function safeRelativePath(entry: string): string | null {
  const normalised = entry.trim().replace(/\\/g, '/')
  if (normalised === '' || normalised.startsWith('/') || /^[A-Za-z]:/.test(normalised)) return null
  const segments = normalised.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return segments.join('/')
}

/** Every bundled mod's config files plus the manifest's extra shared files, deduplicated. */
export function collectSharedFiles(
  manifest: Pick<BundledModsManifest, 'mods' | 'sharedFiles'>
): SharedFileSelection {
  const files = new Set<string>()
  const rejected: string[] = []
  const candidates = [...manifest.mods.flatMap((mod) => mod.configFiles), ...manifest.sharedFiles]
  for (const candidate of candidates) {
    const safe = safeRelativePath(candidate)
    if (safe === null) rejected.push(candidate)
    else files.add(safe)
  }
  return { files: [...files], rejected }
}

function shouldCopyIn(entry: SyncEntry): boolean {
  if (entry.sharedMtimeMs === null) return false
  if (entry.instanceMtimeMs === null) return true
  return entry.sharedMtimeMs > entry.instanceMtimeMs + MTIME_TOLERANCE_MS
}

function shouldCopyOut(entry: SyncEntry): boolean {
  if (entry.instanceMtimeMs === null) return false
  if (entry.sharedMtimeMs === null) return true
  return entry.instanceMtimeMs > entry.sharedMtimeMs + MTIME_TOLERANCE_MS
}

/**
 * Relative paths that must be copied for the given direction.
 * `in`  (before launch): shared -> instance when the shared copy exists and is newer or the instance lacks it.
 * `out` (after exit):    instance -> shared when the instance copy exists and is newer or the shared layer lacks it.
 */
export function planSync(entries: readonly SyncEntry[], direction: SyncDirection): string[] {
  const predicate = direction === 'in' ? shouldCopyIn : shouldCopyOut
  return entries.filter(predicate).map((entry) => entry.rel)
}
