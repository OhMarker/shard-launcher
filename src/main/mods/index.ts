import { join } from 'node:path'
import { ModIndexSchema, type ModIndex, type ModIndexEntry, type ModIndexUpdate } from '@shared/schemas/mod-index'
import type { InstalledMod, ModrinthFile, ModrinthVersion } from '@shared/types'
import { primaryFile } from '../modrinth/mapping'
import { readJsonOrNull, writeJson } from '../util/fs'
import { canonicalJarName, modDisplayName } from './filenames'
import { isConflictingSlug, type ScannedFile } from './scanned'

export const SHARD_META_DIR = '.shard'
export const MOD_INDEX_FILE = 'mods.json'

export function modIndexPath(instanceFolder: string): string {
  return join(instanceFolder, SHARD_META_DIR, MOD_INDEX_FILE)
}

export function emptyModIndex(): ModIndex {
  return { version: 1, files: {}, waiting: [] }
}

/** Missing or corrupt index -> empty; the scanner rebuilds it from the jars. */
export async function readModIndex(instanceFolder: string): Promise<ModIndex> {
  return (await readJsonOrNull(modIndexPath(instanceFolder), ModIndexSchema)) ?? emptyModIndex()
}

export async function writeModIndex(instanceFolder: string, index: ModIndex): Promise<void> {
  await writeJson(modIndexPath(instanceFolder), index)
}

export interface ProjectInfo {
  slug?: string | null
  title?: string | null
  iconUrl?: string | null
  author?: string | null
}

/** Index entry for a freshly downloaded Modrinth file. */
export function entryForVersion(
  version: ModrinthVersion,
  file: ModrinthFile,
  source: ModIndexEntry['source'],
  info: ProjectInfo,
  stat: { size: number; mtimeMs: number },
  fabric: ModIndexEntry['fabric']
): ModIndexEntry {
  const now = new Date().toISOString()
  return {
    source,
    slug: info.slug ?? undefined,
    projectId: version.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    title: info.title ?? undefined,
    iconUrl: info.iconUrl ?? undefined,
    author: info.author ?? undefined,
    sha512: file.sha512.toLowerCase(),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    installedAt: now,
    identifiedAt: now,
    fabric,
    update: null
  }
}

/** Pending-update record for a newer version, or null when it has nothing to download. */
export function updateFromVersion(version: ModrinthVersion): ModIndexUpdate | null {
  const file = primaryFile(version)
  if (!file) return null
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    fileName: file.filename,
    url: file.url,
    sha512: file.sha512,
    size: file.size,
    changelog: version.changelog,
    datePublished: version.datePublished
  }
}

/** Projects the index as the renderer-facing shape. */
export function toInstalledMod(
  file: ScannedFile,
  conflicts: { slug: string; reason: string }[]
): InstalledMod {
  const { entry } = file
  const locked = entry.source === 'bundled' || entry.source === 'shard'
  const conflict = isConflictingSlug(entry, conflicts)
  return {
    fileName: file.fileName,
    path: file.path,
    enabled: file.enabled,
    source: entry.source,
    locked,
    name: entry.title ?? entry.fabric?.name ?? modDisplayName(canonicalJarName(file.fileName)),
    version: entry.versionNumber ?? entry.fabric?.version ?? null,
    sha512: entry.sha512,
    sizeBytes: entry.size,
    modrinth:
      entry.projectId && entry.versionId
        ? {
            projectId: entry.projectId,
            versionId: entry.versionId,
            slug: entry.slug ?? null,
            title: entry.title ?? null,
            iconUrl: entry.iconUrl ?? null,
            author: entry.author ?? null,
            versionNumber: entry.versionNumber ?? null
          }
        : null,
    fabric: entry.fabric ?? null,
    status: !file.enabled ? 'disabled' : conflict ? 'conflict' : entry.update ? 'update-available' : 'ok',
    update: entry.update
      ? {
          versionId: entry.update.versionId,
          versionNumber: entry.update.versionNumber,
          fileName: entry.update.fileName,
          changelog: entry.update.changelog,
          datePublished: entry.update.datePublished
        }
      : null
  }
}
