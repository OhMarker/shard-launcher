import { createWriteStream } from 'node:fs'
import { open, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { type ReadableStream as WebReadableStream } from 'node:stream/web'
import { ShardError } from '@shared/errors'
import { type DownloadProgress } from '@shared/types'
import { createLogger } from '../logger'
import { ensureDir, hashFile, makeExecutable } from '../util/fs'
import { getDefaultUserAgent, toNetworkError } from './http'

const log = createLogger('download')

export interface DownloadTask {
  url: string
  dest: string
  size?: number
  sha1?: string
  sha512?: string
  sha256?: string
  executable?: boolean
  /** 'hash' (default) verifies existing files by hash; 'size' trusts a matching size. */
  verify?: 'hash' | 'size'
  label?: string
}

export interface DownloadBatchOptions {
  concurrency: number
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
  retries?: number
  /** Called when a task is skipped because the file already exists and verifies. */
  onSkip?: (task: DownloadTask) => void
}

export interface VerifySpec {
  size?: number
  sha1?: string
  sha512?: string
  sha256?: string
}

/** True when the file exists and matches every provided check. */
export async function verifyFile(path: string, spec: VerifySpec, mode: 'hash' | 'size' = 'hash'): Promise<boolean> {
  let s
  try {
    s = await stat(path)
  } catch {
    return false
  }
  if (!s.isFile()) return false
  if (spec.size !== undefined && s.size !== spec.size) return false
  if (mode === 'size') return spec.size !== undefined || s.size > 0
  if (spec.sha512) return (await hashFile(path, 'sha512')) === spec.sha512.toLowerCase()
  if (spec.sha256) return (await hashFile(path, 'sha256')) === spec.sha256.toLowerCase()
  if (spec.sha1) return (await hashFile(path, 'sha1')) === spec.sha1.toLowerCase()
  return spec.size !== undefined ? true : s.size > 0
}

class SpeedMeter {
  private samples: Array<{ t: number; bytes: number }> = []
  private total = 0

  add(bytes: number): void {
    this.total += bytes
    const now = Date.now()
    this.samples.push({ t: now, bytes })
    const cutoff = now - 3000
    while (this.samples.length && (this.samples[0]?.t ?? 0) < cutoff) this.samples.shift()
  }

  bytesPerSecond(): number {
    if (this.samples.length < 2) return 0
    const first = this.samples[0]!
    const last = this.samples[this.samples.length - 1]!
    const span = (last.t - first.t) / 1000
    if (span <= 0) return 0
    const bytes = this.samples.reduce((a, s) => a + s.bytes, 0)
    return bytes / span
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ShardError('CANCELLED', 'Download cancelled')
}

/**
 * Downloads one file to `dest` via a `.part` file, resuming with a Range request when a
 * partial file exists, then verifies hashes and atomically renames into place.
 */
export async function downloadFile(
  task: DownloadTask,
  options: { signal?: AbortSignal; onBytes?: (n: number) => void; retries?: number } = {}
): Promise<void> {
  const retries = options.retries ?? 3
  const part = `${task.dest}.part`
  await ensureDir(dirname(task.dest))

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(options.signal)
    try {
      let offset = 0
      try {
        offset = (await stat(part)).size
      } catch {
        offset = 0
      }
      if (task.size !== undefined && offset > task.size) {
        await rm(part, { force: true })
        offset = 0
      }

      const headers: Record<string, string> = { 'User-Agent': getDefaultUserAgent() }
      if (offset > 0) headers.Range = `bytes=${offset}-`

      const res = await fetch(task.url, {
        headers,
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        redirect: 'follow'
      })

      if (res.status === 416) {
        // Range not satisfiable: the part file is complete or corrupt. Start over.
        await rm(part, { force: true })
        offset = 0
        continue
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new ShardError('HTTP', `HTTP ${res.status} downloading ${task.label ?? task.url}`, {
          details: { status: res.status, url: task.url, body: body.slice(0, 500) }
        })
      }
      if (!res.body) throw new ShardError('HTTP', `Empty body for ${task.url}`)

      const resuming = res.status === 206 && offset > 0
      if (!resuming && offset > 0) {
        await rm(part, { force: true })
        offset = 0
      }
      if (resuming && options.onBytes) options.onBytes(0)

      const fileStream = createWriteStream(part, { flags: resuming ? 'a' : 'w' })
      const source = Readable.fromWeb(res.body as unknown as WebReadableStream)
      source.on('data', (chunk: Buffer) => options.onBytes?.(chunk.length))
      await pipeline(source, fileStream)

      const ok = await verifyFile(part, task, 'hash')
      if (!ok) {
        await rm(part, { force: true })
        throw new ShardError('CHECKSUM_MISMATCH', `Checksum mismatch for ${task.label ?? task.url}`, {
          details: { url: task.url }
        })
      }
      await rm(task.dest, { force: true })
      await rename(part, task.dest)
      if (task.executable) await makeExecutable(task.dest)
      return
    } catch (err) {
      const mapped = err instanceof ShardError ? err : toNetworkError(err, task.url)
      if (mapped.code === 'CANCELLED') throw mapped
      if (attempt >= retries) {
        log.error(`Giving up on ${task.url}: ${mapped.message}`)
        throw mapped
      }
      const delay = Math.min(10_000, 400 * 2 ** attempt) + Math.floor(Math.random() * 300)
      log.warn(`Retrying ${task.label ?? task.url} in ${delay}ms (${mapped.code})`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

/**
 * Downloads many files with a worker pool. Files that already exist and verify are
 * skipped. Progress includes bytes, counts, speed and ETA, throttled to ~10 Hz.
 */
export async function downloadBatch(tasks: DownloadTask[], options: DownloadBatchOptions): Promise<void> {
  if (tasks.length === 0) {
    options.onProgress?.({
      totalBytes: 0,
      doneBytes: 0,
      totalFiles: 0,
      doneFiles: 0,
      bytesPerSecond: 0,
      etaSeconds: 0,
      currentFile: null
    })
    return
  }

  const knownTotal = tasks.reduce((a, t) => a + (t.size ?? 0), 0)
  let totalBytes = knownTotal
  let doneBytes = 0
  let doneFiles = 0
  let currentFile: string | null = null
  const meter = new SpeedMeter()
  let lastEmit = 0

  const emit = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < 100) return
    lastEmit = now
    const speed = meter.bytesPerSecond()
    const remaining = Math.max(0, totalBytes - doneBytes)
    options.onProgress?.({
      totalBytes,
      doneBytes,
      totalFiles: tasks.length,
      doneFiles,
      bytesPerSecond: speed,
      etaSeconds: speed > 0 && totalBytes > 0 ? remaining / speed : null,
      currentFile
    })
  }

  const queue = [...tasks]
  let firstError: unknown = null

  const worker = async (): Promise<void> => {
    while (queue.length) {
      if (firstError) return
      throwIfAborted(options.signal)
      const task = queue.shift()
      if (!task) return
      try {
        if (await verifyFile(task.dest, task, task.verify ?? 'hash')) {
          doneFiles++
          if (task.size !== undefined) doneBytes += task.size
          else {
            const s = await stat(task.dest).catch(() => null)
            if (s) {
              totalBytes += s.size
              doneBytes += s.size
            }
          }
          options.onSkip?.(task)
          emit()
          continue
        }
        currentFile = task.label ?? task.dest.split(/[\\/]/).pop() ?? null
        let received = 0
        await downloadFile(task, {
          signal: options.signal,
          retries: options.retries,
          onBytes: (n) => {
            received += n
            doneBytes += n
            meter.add(n)
            emit()
          }
        })
        if (task.size === undefined) totalBytes += received
        doneFiles++
        emit()
      } catch (err) {
        firstError ??= err
        return
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency, tasks.length)) }, worker)
  await Promise.all(workers)
  if (firstError) throw firstError
  emit(true)
}

/** Reads a remote file fully into memory with size/hash verification (for small files). */
export async function downloadToBuffer(url: string, spec: VerifySpec = {}, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': getDefaultUserAgent() },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000)
  }).catch((err) => {
    throw toNetworkError(err, url)
  })
  if (!res.ok) throw new ShardError('HTTP', `HTTP ${res.status} downloading ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (spec.size !== undefined && buf.length !== spec.size) {
    throw new ShardError('CHECKSUM_MISMATCH', `Size mismatch for ${url}`)
  }
  const { createHash } = await import('node:crypto')
  const check = (algo: string, expected?: string): void => {
    if (!expected) return
    const actual = createHash(algo).update(buf).digest('hex')
    if (actual !== expected.toLowerCase()) {
      throw new ShardError('CHECKSUM_MISMATCH', `${algo} mismatch for ${url}`)
    }
  }
  check('sha512', spec.sha512)
  check('sha256', spec.sha256)
  check('sha1', spec.sha1)
  return buf
}

/** Writes a buffer to disk atomically (helper for callers of downloadToBuffer). */
export async function writeBufferAtomic(dest: string, buf: Buffer, executable = false): Promise<void> {
  await ensureDir(dirname(dest))
  const tmp = `${dest}.part`
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(buf)
  } finally {
    await fh.close()
  }
  await rm(dest, { force: true })
  await rename(tmp, dest)
  if (executable) await makeExecutable(dest)
}
