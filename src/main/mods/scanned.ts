import type { ModIndexEntry } from '@shared/schemas/mod-index'
import type { ConflictDef } from '@shared/types'

/** One jar found in the mods folder, joined with its index entry. */
export interface ScannedFile {
  /** On-disk name, possibly ending in `.disabled`. */
  fileName: string
  /** Index key: the `.jar` name. */
  canonical: string
  path: string
  enabled: boolean
  entry: ModIndexEntry
}

/** True when the manifest lists this mod's slug or project id as conflicting with Shard. */
export function isConflictingSlug(entry: Pick<ModIndexEntry, 'slug' | 'projectId'>, conflicts: ConflictDef[]): boolean {
  return conflicts.some((c) => (entry.slug !== undefined && c.slug === entry.slug) || (entry.projectId !== undefined && c.slug === entry.projectId))
}
