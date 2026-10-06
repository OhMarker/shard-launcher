import { join, posix } from 'node:path'
import AdmZip from 'adm-zip'
import { ShardError } from '@shared/errors'
import { MrpackIndexSchema, type MrpackIndex } from '@shared/schemas/modrinth'
import type { ModrinthVersion } from '@shared/types'
import { canonicalJarName, isShardJarName, MODS_DIR } from './filenames'

const INDEX_ENTRY = 'modrinth.index.json'
const OVERRIDE_DIRS = ['overrides/', 'client-overrides/']

/**
 * Normalises a path from a pack to a safe instance-relative posix path, or null when it
 * is absolute, escapes the instance folder or is empty.
 */
export function sanitizeRelativePath(input: string): string | null {
  const unified = input.replace(/\\/g, '/')
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified) || unified.includes('\0')) return null
  const normalised = posix.normalize(unified)
  if (normalised === '.' || normalised === '' || normalised === '..' || normalised.startsWith('../')) return null
  return normalised
}

export interface MrpackFileTask {
  relativePath: string
  dest: string
  url: string
  sha512: string
  size: number | undefined
}

export interface MrpackPlanOptions {
  folder: string
  /** Canonical names of jars that must not be overwritten (bundled set, Shard client). */
  lockedJarNames: Set<string>
  /** Project ids of the bundled set; pack files for those projects are skipped. */
  bundledProjectIds: Set<string>
  /** sha512 -> version for pack files Modrinth knows about (may be partial). */
  knownVersions: Record<string, ModrinthVersion>
  /** Slugs/ids the bundled manifest marks as conflicting with Shard. */
  conflictIds: Set<string>
}

export interface MrpackPlan {
  files: MrpackFileTask[]
  skipped: string[]
}

/** Decides which pack files to download and which to skip (server-only, unsafe, Shard-owned). */
export function planMrpackFiles(index: MrpackIndex, opts: MrpackPlanOptions): MrpackPlan {
  const files: MrpackFileTask[] = []
  const skipped: string[] = []
  for (const file of index.files) {
    const relative = sanitizeRelativePath(file.path)
    if (!relative) {
      skipped.push(`${file.path}: unsafe path`)
      continue
    }
    if (file.env?.client === 'unsupported') {
      skipped.push(`${relative}: server-only`)
      continue
    }
    const url = file.downloads[0]
    if (!url) {
      skipped.push(`${relative}: no download URL`)
      continue
    }
    const baseName = posix.basename(relative)
    const inMods = relative.startsWith(`${MODS_DIR}/`)
    if (inMods && (isShardJarName(baseName) || opts.lockedJarNames.has(canonicalJarName(baseName)))) {
      skipped.push(`${baseName}: would overwrite a Shard Core file`)
      continue
    }
    const known = opts.knownVersions[file.hashes.sha512.toLowerCase()]
    if (known && opts.bundledProjectIds.has(known.projectId)) {
      skipped.push(`${baseName}: already part of Shard Core`)
      continue
    }
    if (known && opts.conflictIds.has(known.projectId)) {
      skipped.push(`${baseName}: conflicts with Shard`)
      continue
    }
    files.push({
      relativePath: relative,
      dest: join(opts.folder, ...relative.split('/')),
      url,
      sha512: file.hashes.sha512.toLowerCase(),
      size: file.fileSize
    })
  }
  return { files, skipped }
}

export interface OpenedMrpack {
  index: MrpackIndex
  zip: AdmZip
}

/** Opens an .mrpack and validates its index. */
export function openMrpack(path: string): OpenedMrpack {
  let zip: AdmZip
  try {
    zip = new AdmZip(path)
  } catch (err) {
    throw new ShardError('INVALID_INPUT', 'That file is not a valid .mrpack archive', { cause: err })
  }
  const entry = zip.getEntry(INDEX_ENTRY)
  if (!entry) throw new ShardError('INVALID_INPUT', `The pack has no ${INDEX_ENTRY}`)
  let raw: unknown
  try {
    raw = JSON.parse(entry.getData().toString('utf8'))
  } catch (err) {
    throw new ShardError('INVALID_INPUT', `${INDEX_ENTRY} is not valid JSON`, { cause: err })
  }
  const parsed = MrpackIndexSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ShardError('INVALID_INPUT', `${INDEX_ENTRY} has an unexpected shape`, {
      details: parsed.error.issues.slice(0, 10)
    })
  }
  return { index: parsed.data, zip }
}

export interface OverrideFile {
  /** Instance-relative posix path. */
  relativePath: string
  data: () => Buffer
}

/** Files under overrides/ and client-overrides/, with unsafe paths dropped. */
export function listOverrideFiles(zip: AdmZip): { files: OverrideFile[]; skipped: string[] } {
  const files: OverrideFile[] = []
  const skipped: string[] = []
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const prefix = OVERRIDE_DIRS.find((p) => entry.entryName.startsWith(p))
    if (!prefix) continue
    const relative = sanitizeRelativePath(entry.entryName.slice(prefix.length))
    if (!relative) {
      skipped.push(`${entry.entryName}: unsafe path`)
      continue
    }
    files.push({ relativePath: relative, data: () => entry.getData() })
  }
  return { files, skipped }
}
