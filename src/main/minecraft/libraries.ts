/**
 * Turns the `libraries` array of a (merged) version JSON into download tasks and the
 * classpath, honouring rules. Legacy `natives`/`classifiers` entries are downloaded and
 * extracted into the natives folder; modern versions (>= 1.19) ship natives as ordinary
 * classified libraries that LWJGL extracts itself.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import AdmZip from 'adm-zip'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { type Library } from '@shared/schemas/mojang'
import { type DownloadTask } from '../net/downloader'
import { mavenToPath } from '../paths'
import { ensureDir } from '../util/fs'
import { type RuleEnvironment, rulesAllow } from './rules'

export interface NativeTask extends DownloadTask {
  /** Entry name prefixes that must not be extracted (typically `META-INF/`). */
  exclude: string[]
}

export interface LibraryPlan {
  tasks: DownloadTask[]
  /** Absolute jar paths in classpath order. */
  classpathEntries: string[]
  nativesTasks: NativeTask[]
}

export interface LibraryPlanOptions {
  env: RuleEnvironment
  librariesDir: string
}

function mavenUrl(base: string | undefined, relativePath: string): string {
  const root = base ?? URLS.librariesBase
  return root.endsWith('/') ? `${root}${relativePath}` : `${root}/${relativePath}`
}

function localPath(librariesDir: string, relativePath: string): string {
  const target = resolve(librariesDir, ...relativePath.split('/'))
  const rel = relative(librariesDir, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ShardError('MANIFEST_INVALID', `Library path escapes the libraries folder: ${relativePath}`)
  }
  return target
}

export function planLibraries(libraries: readonly Library[], options: LibraryPlanOptions): LibraryPlan {
  const tasks: DownloadTask[] = []
  const nativesTasks: NativeTask[] = []
  const classpathEntries: string[] = []
  const seen = new Set<string>()

  const addClasspath = (path: string): void => {
    if (seen.has(path)) return
    seen.add(path)
    classpathEntries.push(path)
  }

  for (const lib of libraries) {
    if (!rulesAllow(lib.rules, options.env)) continue

    const artifact = lib.downloads?.artifact
    if (artifact) {
      const dest = localPath(options.librariesDir, artifact.path ?? mavenToPath(lib.name))
      tasks.push({ url: artifact.url, dest, sha1: artifact.sha1, size: artifact.size, label: lib.name })
      addClasspath(dest)
    } else if (!lib.downloads) {
      // Fabric meta style: Maven coordinate plus repository URL, hashes when known.
      const rel = mavenToPath(lib.name)
      const dest = localPath(options.librariesDir, rel)
      tasks.push({ url: mavenUrl(lib.url, rel), dest, sha1: lib.sha1, size: lib.size, label: lib.name })
      addClasspath(dest)
    }

    if (lib.natives && lib.downloads?.classifiers) {
      const classifier = lib.natives[options.env.os.name]?.replace(
        '${arch}',
        options.env.os.arch === 'x86' ? '32' : '64'
      )
      const info = classifier ? lib.downloads.classifiers[classifier] : undefined
      if (info) {
        const dest = localPath(options.librariesDir, info.path ?? mavenToPath(`${lib.name}:${classifier}`))
        nativesTasks.push({
          url: info.url,
          dest,
          sha1: info.sha1,
          size: info.size,
          label: `${lib.name}:${classifier}`,
          exclude: lib.extract?.exclude ?? []
        })
      }
    }
  }

  return { tasks, classpathEntries, nativesTasks }
}

/** Unpacks downloaded native jars into `nativesDir`, skipping excluded prefixes. */
export async function extractNatives(natives: readonly NativeTask[], nativesDir: string): Promise<void> {
  await ensureDir(nativesDir)
  for (const native of natives) {
    const zip = new AdmZip(native.dest)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      if (native.exclude.some((prefix) => entry.entryName.startsWith(prefix))) continue
      const target = resolve(nativesDir, entry.entryName)
      const rel = relative(nativesDir, target)
      if (rel.startsWith('..') || isAbsolute(rel)) continue
      await ensureDir(dirname(target))
      await writeFile(target, entry.getData())
    }
  }
}

export function nativesDirFor(instanceFolder: string): string {
  return join(instanceFolder, 'natives')
}
