import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  chmod
} from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { type ZodType } from 'zod'
import { ShardError } from '@shared/errors'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function fileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path)
    return s.isFile() ? s.size : null
  } catch {
    return null
  }
}

/** Writes to a temp file next to the target and renames, so a crash never leaves a half-written file. */
export async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, data)
  try {
    await rename(tmp, path)
  } catch (err) {
    // Windows can refuse to rename over an open file; fall back to a direct write.
    await rm(tmp, { force: true })
    if ((err as NodeJS.ErrnoException).code === 'EPERM' || (err as NodeJS.ErrnoException).code === 'EEXIST') {
      await writeFile(path, data)
      return
    }
    throw err
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value, null, 2))
}

export async function readJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new ShardError('MANIFEST_INVALID', `${path} is not valid JSON`, { cause: err })
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new ShardError('MANIFEST_INVALID', `${path} failed validation`, {
      details: result.error.issues
    })
  }
  return result.data
}

/** Like readJson but returns null when the file is missing or invalid. */
export async function readJsonOrNull<T>(path: string, schema: ZodType<T>): Promise<T | null> {
  try {
    return await readJson(path, schema)
  } catch {
    return null
  }
}

export type HashAlgorithm = 'sha1' | 'sha256' | 'sha512' | 'md5'

export function hashFile(path: string, algorithm: HashAlgorithm): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

export function hashBuffer(data: Buffer | string, algorithm: HashAlgorithm): string {
  return createHash(algorithm).update(data).digest('hex')
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(full)
    else if (entry.isFile()) {
      try {
        total += (await stat(full)).size
      } catch {
        // skip unreadable
      }
    }
  }
  return total
}

export interface CopyDirOptions {
  filter?: (relativePath: string) => boolean
  onFile?: (relativePath: string, bytes: number) => void
}

export async function copyDir(src: string, dest: string, options: CopyDirOptions = {}): Promise<void> {
  await ensureDir(dest)
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    const rel = relative(src, from)
    if (options.filter && !options.filter(rel)) continue
    if (entry.isDirectory()) {
      await copyDir(from, to, {
        filter: options.filter ? (r) => options.filter!(join(rel, r)) : undefined,
        onFile: options.onFile ? (r, b) => options.onFile!(join(rel, r), b) : undefined
      })
    } else if (entry.isFile()) {
      await ensureDir(dirname(to))
      await copyFile(from, to)
      if (options.onFile) options.onFile(rel, (await stat(from)).size)
    }
  }
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}

export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && (!ext || e.name.toLowerCase().endsWith(ext)))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

export async function makeExecutable(path: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    await chmod(path, 0o755)
  } catch {
    // ignore
  }
}

/** Safe folder names on every platform. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  return cleaned.length ? cleaned.slice(0, 80) : 'instance'
}
