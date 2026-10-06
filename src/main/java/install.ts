/** Managed runtime installers: Mojang's java-runtime catalogue first, Adoptium as fallback. */
import { spawn } from 'node:child_process'
import { readdir, rm, symlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { AdoptiumAssetListSchema } from '@shared/schemas/misc'
import { JavaRuntimeAllSchema, JavaRuntimeManifestSchema, type JavaRuntimeEntry } from '@shared/schemas/mojang'
import { type DownloadProgress } from '@shared/types'
import { createLogger } from '../logger'
import { parseJsonBuffer } from '../minecraft/parse'
import { downloadBatch, downloadToBuffer, type DownloadTask } from '../net/downloader'
import { httpJson } from '../net/http'
import { ensureDir, exists, makeExecutable, removeDir } from '../util/fs'
import { adoptiumTarget, javaExecutableCandidates, javaExecutableName } from './platform'
import { majorFromVersionName } from './version'

const log = createLogger('java')

const EXECUTABLE_SEARCH_DEPTH = 4

export interface InstallOptions {
  major: number
  javaDir: string
  tempDir: string
  concurrency: number
  signal?: AbortSignal
  onProgress: (download: DownloadProgress, message: string) => void
}

export interface InstalledRuntime {
  installDir: string
  source: 'mojang' | 'adoptium'
  component: string | null
  versionName: string
}

function withinDir(root: string, relativePath: string): string {
  const target = resolve(root, ...relativePath.split('/'))
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ShardError('MANIFEST_INVALID', `Runtime manifest entry escapes its folder: ${relativePath}`)
  }
  return target
}

interface Candidate {
  component: string
  entry: JavaRuntimeEntry
}

/**
 * Installs the Mojang runtime whose version major matches. Returns null when the catalogue
 * has nothing for this major/platform (the caller then falls back to Adoptium).
 */
export async function installMojangRuntime(options: InstallOptions, platformKey: string): Promise<InstalledRuntime | null> {
  const all = await httpJson(URLS.javaRuntimeAll, JavaRuntimeAllSchema, { signal: options.signal })
  const platform = all[platformKey]
  if (!platform) return null

  const candidates: Candidate[] = []
  for (const [component, entries] of Object.entries(platform)) {
    if (component === 'minecraft-java-exe') continue
    for (const entry of entries) {
      if (majorFromVersionName(entry.version.name) === options.major) candidates.push({ component, entry })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const snapshotDiff = Number(a.component.includes('snapshot')) - Number(b.component.includes('snapshot'))
    if (snapshotDiff !== 0) return snapshotDiff
    const releasedDiff = Date.parse(b.entry.version.released) - Date.parse(a.entry.version.released)
    return releasedDiff !== 0 ? releasedDiff : a.component.localeCompare(b.component)
  })
  const { component, entry } = candidates[0]!
  log.info(`Installing Mojang runtime ${component} ${entry.version.name} for ${platformKey}`)

  const manifestBuffer = await downloadToBuffer(
    entry.manifest.url,
    { sha1: entry.manifest.sha1, size: entry.manifest.size },
    options.signal
  )
  const manifest = parseJsonBuffer(manifestBuffer, JavaRuntimeManifestSchema, `Runtime manifest for ${component}`)

  const installDir = join(options.javaDir, `${component}-${platformKey}`)
  await ensureDir(installDir)

  const tasks: DownloadTask[] = []
  const links: Array<{ path: string; target: string }> = []
  for (const [rel, file] of Object.entries(manifest.files)) {
    const dest = withinDir(installDir, rel)
    if (file.type === 'directory') {
      await ensureDir(dest)
    } else if (file.type === 'file' && file.downloads) {
      tasks.push({
        url: file.downloads.raw.url,
        dest,
        sha1: file.downloads.raw.sha1,
        size: file.downloads.raw.size,
        executable: file.executable ?? false,
        label: rel
      })
    } else if (file.type === 'link' && file.target) {
      links.push({ path: dest, target: file.target })
    }
  }

  await downloadBatch(tasks, {
    concurrency: options.concurrency,
    signal: options.signal,
    onProgress: (download) =>
      options.onProgress(download, `Downloading Java ${options.major} (${download.doneFiles}/${download.totalFiles})`)
  })

  for (const link of links) {
    try {
      await rm(link.path, { force: true })
      await symlink(link.target, link.path)
    } catch (err) {
      // Symlinks need privileges on Windows; Mojang's Windows runtimes do not use them anyway.
      log.debug(`Could not create runtime symlink ${link.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { installDir, source: 'mojang', component, versionName: entry.version.name }
}

function extractTarGz(archive: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archive, '-C', dest], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => reject(new ShardError('JAVA_DOWNLOAD_FAILED', `Could not run tar: ${err.message}`, { cause: err })))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new ShardError('JAVA_DOWNLOAD_FAILED', `tar exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

/** Downloads the latest Temurin JRE for the major from api.adoptium.net and unpacks it. */
export async function installAdoptiumRuntime(options: InstallOptions): Promise<InstalledRuntime> {
  const target = adoptiumTarget(process.platform, process.arch)
  if (!target) {
    throw new ShardError('JAVA_DOWNLOAD_FAILED', `No Java ${options.major} runtime is available for ${process.platform}-${process.arch}`)
  }
  const query = new URLSearchParams({
    architecture: target.architecture,
    image_type: 'jre',
    os: target.os,
    vendor: 'eclipse'
  })
  const url = `${URLS.adoptium}/assets/latest/${options.major}/hotspot?${query.toString()}`
  const assets = await httpJson(url, AdoptiumAssetListSchema, { signal: options.signal })
  const asset = assets[0]
  if (!asset) {
    throw new ShardError('JAVA_DOWNLOAD_FAILED', `Adoptium has no Java ${options.major} build for ${target.os}-${target.architecture}`)
  }
  const pkg = asset.binary.package
  log.info(`Installing Adoptium runtime ${asset.release_name} (${pkg.name})`)

  const archive = join(options.tempDir, pkg.name)
  const installDir = join(options.javaDir, `adoptium-${options.major}-${target.architecture}`)
  await ensureDir(options.tempDir)
  await removeDir(installDir)
  await ensureDir(installDir)

  await downloadBatch(
    [{ url: pkg.link, dest: archive, sha256: pkg.checksum, size: pkg.size, label: pkg.name }],
    {
      concurrency: 1,
      signal: options.signal,
      onProgress: (download) => options.onProgress(download, `Downloading Java ${options.major} (Adoptium)`)
    }
  )

  options.onProgress(
    { totalBytes: pkg.size ?? 0, doneBytes: pkg.size ?? 0, totalFiles: 1, doneFiles: 1, bytesPerSecond: 0, etaSeconds: 0, currentFile: pkg.name },
    `Extracting Java ${options.major}`
  )
  try {
    const lower = pkg.name.toLowerCase()
    if (lower.endsWith('.zip')) new AdmZip(archive).extractAllTo(installDir, true)
    else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) await extractTarGz(archive, installDir)
    else throw new ShardError('JAVA_DOWNLOAD_FAILED', `Unsupported runtime archive format: ${pkg.name}`)
  } finally {
    await rm(archive, { force: true })
  }

  return { installDir, source: 'adoptium', component: null, versionName: asset.version.semver ?? asset.release_name }
}

async function searchForExecutable(dir: string, name: string, depth: number): Promise<string | null> {
  if (depth > EXECUTABLE_SEARCH_DEPTH) return null
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const bin = entries.find((e) => e.isDirectory() && e.name === 'bin')
  if (bin && (await exists(join(dir, 'bin', name)))) return join(dir, 'bin', name)
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'bin') continue
    const found = await searchForExecutable(join(dir, entry.name), name, depth + 1)
    if (found) return found
  }
  return null
}

/** Finds the java executable inside an install folder (known layouts first, then a search). */
export async function locateJavaExecutable(installDir: string): Promise<string | null> {
  for (const candidate of javaExecutableCandidates(process.platform)) {
    const path = join(installDir, ...candidate.split('/'))
    if (await exists(path)) {
      await makeExecutable(path)
      return path
    }
  }
  const found = await searchForExecutable(installDir, javaExecutableName(process.platform), 0)
  if (found) await makeExecutable(found)
  return found
}
