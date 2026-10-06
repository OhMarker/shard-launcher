import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ShardError } from '@shared/errors'
import type { ModIndex, ModIndexEntry } from '@shared/schemas/mod-index'
import type { BundledModsManifest, InstalledMod, ModrinthProject, ModrinthVersion } from '@shared/types'
import type { ModrinthClient } from '../context'
import { createLogger } from '../logger'
import { hashFile, listFiles } from '../util/fs'
import { canonicalJarName, isDisabledJarName, isModFileName, isShardJarName, MODS_DIR } from './filenames'
import { readModIndex, toInstalledMod, writeModIndex } from './index'
import { readFabricModJson } from './jar'
import { type BundledProjects } from './manifest'
import { type ScannedFile } from './scanned'

const log = createLogger('mods:scan')

export interface ScanOptions {
  folder: string
  manifest: BundledModsManifest
  bundledProjects: BundledProjects
  modrinth: ModrinthClient
}

export interface ScanResult {
  files: ScannedFile[]
  mods: InstalledMod[]
  index: ModIndex
}

function sameFile(entry: ModIndexEntry, s: { size: number; mtimeMs: number }): boolean {
  return entry.size === s.size && entry.mtimeMs === s.mtimeMs
}

/** Applies what Modrinth knows about a hash to an index entry. */
export function identifyEntry(
  entry: ModIndexEntry,
  version: ModrinthVersion,
  project: ModrinthProject | undefined,
  source: 'bundled' | 'modrinth'
): ModIndexEntry {
  return {
    ...entry,
    source,
    projectId: version.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    slug: project?.slug ?? entry.slug,
    title: project?.title ?? entry.title,
    iconUrl: project?.iconUrl ?? entry.iconUrl,
    identifiedAt: new Date().toISOString()
  }
}

/**
 * Reconciles the mods folder with `.shard/mods.json`: hashes new or changed jars, reads
 * fabric.mod.json once per jar, asks Modrinth about unknown hashes and classifies every
 * file as bundled / shard / modrinth / local.
 */
export async function scanMods(opts: ScanOptions): Promise<ScanResult> {
  const modsDir = join(opts.folder, MODS_DIR)
  const index = await readModIndex(opts.folder)
  const names = (await listFiles(modsDir)).filter(isModFileName)
  const files: ScannedFile[] = []
  const present = new Set<string>()
  let changed = false

  for (const fileName of names) {
    const canonical = canonicalJarName(fileName)
    if (present.has(canonical)) {
      // Both foo.jar and foo.jar.disabled exist; the enabled copy wins, the other is noise.
      log.warn(`Both enabled and disabled copies of ${canonical} exist in ${modsDir}`)
      continue
    }
    const path = join(modsDir, fileName)
    let s
    try {
      s = await stat(path)
    } catch {
      continue
    }
    present.add(canonical)
    let entry = index.files[canonical]
    if (!entry || !sameFile(entry, s)) {
      const sha512 = await hashFile(path, 'sha512')
      if (entry && entry.sha512 === sha512) {
        entry = { ...entry, size: s.size, mtimeMs: s.mtimeMs }
      } else {
        entry = {
          source: isShardJarName(canonical) ? 'shard' : 'local',
          sha512,
          size: s.size,
          mtimeMs: s.mtimeMs,
          installedAt: new Date().toISOString()
        }
      }
      changed = true
    }
    if (entry.fabric === undefined) {
      entry = { ...entry, fabric: await readFabricModJson(path) }
      changed = true
    }
    index.files[canonical] = entry
    files.push({ fileName, canonical, path, enabled: !isDisabledJarName(fileName), entry })
  }

  for (const key of Object.keys(index.files)) {
    if (!present.has(key)) {
      delete index.files[key]
      changed = true
    }
  }

  const bundledIds = new Map([...opts.bundledProjects.entries()].map(([slug, p]) => [p.projectId, slug]))
  const bundledSlugs = new Set(opts.manifest.mods.map((m) => m.slug))

  const unidentified = files.filter((f) => f.entry.source !== 'shard' && f.entry.identifiedAt === undefined)
  if (unidentified.length > 0) {
    try {
      const found = await opts.modrinth.getVersionsByHashes(unidentified.map((f) => f.entry.sha512))
      const projectIds = [...new Set(Object.values(found).map((v) => v.projectId))]
      const projects = new Map<string, ModrinthProject>()
      if (projectIds.length > 0) {
        try {
          for (const p of await opts.modrinth.getProjects(projectIds)) projects.set(p.id, p)
        } catch (err) {
          const e = ShardError.from(err)
          log.warn(`Could not load project details for identified mods (${e.code}: ${e.message})`)
        }
      }
      const now = new Date().toISOString()
      for (const file of unidentified) {
        const version = found[file.entry.sha512]
        file.entry = version
          ? identifyEntry(file.entry, version, projects.get(version.projectId), bundledIds.has(version.projectId) ? 'bundled' : 'modrinth')
          : { ...file.entry, identifiedAt: now }
        index.files[file.canonical] = file.entry
      }
      changed = true
    } catch (err) {
      const e = ShardError.from(err)
      log.warn(`Could not identify ${unidentified.length} mod(s) on Modrinth (${e.code}: ${e.message})`)
    }
  }

  // Bundled membership follows the current manifest so a mod dropped from the set unlocks.
  for (const file of files) {
    const { entry } = file
    if (entry.source !== 'bundled' && entry.source !== 'modrinth') continue
    const inSet =
      (entry.projectId !== undefined && bundledIds.has(entry.projectId)) ||
      (entry.slug !== undefined && bundledSlugs.has(entry.slug))
    const source = inSet ? 'bundled' : 'modrinth'
    if (entry.source !== source) {
      file.entry = { ...entry, source }
      index.files[file.canonical] = file.entry
      changed = true
    }
    if (inSet && entry.slug === undefined && entry.projectId !== undefined) {
      const slug = bundledIds.get(entry.projectId)
      if (slug) {
        file.entry = { ...file.entry, slug }
        index.files[file.canonical] = file.entry
        changed = true
      }
    }
  }

  if (changed) await writeModIndex(opts.folder, index)
  return {
    files,
    mods: files.map((f) => toInstalledMod(f, opts.manifest.conflicts)),
    index
  }
}
