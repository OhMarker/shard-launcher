import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { downloadBatch, downloadFile, verifyFile } from '@main/net/downloader'

const payload = Buffer.from('shard launcher download test payload '.repeat(200))
const sha1 = createHash('sha1').update(payload).digest('hex')
const sha512 = createHash('sha512').update(payload).digest('hex')

let server: Server
let base = ''
let dir = ''
let requests: string[] = []
let failFirst = false

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shard-dl-'))
  server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url} ${req.headers.range ?? ''}`.trim())
    if (req.url === '/flaky' && failFirst) {
      failFirst = false
      res.statusCode = 503
      res.end('try again')
      return
    }
    if (req.url === '/missing') {
      res.statusCode = 404
      res.end('nope')
      return
    }
    const range = req.headers.range
    if (range) {
      const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${payload.length - 1}/${payload.length}`)
      res.setHeader('Content-Length', payload.length - start)
      res.end(payload.subarray(start))
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Length', payload.length)
    res.end(payload)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

describe('verifyFile', () => {
  it('checks size and hashes', async () => {
    const p = join(dir, 'verify.bin')
    await writeFile(p, payload)
    expect(await verifyFile(p, { size: payload.length, sha1 })).toBe(true)
    expect(await verifyFile(p, { sha512 })).toBe(true)
    expect(await verifyFile(p, { size: 1 })).toBe(false)
    expect(await verifyFile(p, { sha1: 'deadbeef' })).toBe(false)
    expect(await verifyFile(p, { size: payload.length, sha1: 'deadbeef' }, 'size')).toBe(true)
    expect(await verifyFile(join(dir, 'nope.bin'), {})).toBe(false)
  })
})

describe('downloadFile', () => {
  it('downloads, verifies and renames the part file', async () => {
    requests = []
    const dest = join(dir, 'a', 'b', 'file.bin')
    let bytes = 0
    await downloadFile({ url: `${base}/file`, dest, sha1, size: payload.length }, { onBytes: (n) => (bytes += n) })
    expect((await readFile(dest)).equals(payload)).toBe(true)
    expect(bytes).toBe(payload.length)
    await expect(stat(`${dest}.part`)).rejects.toThrow()
  })

  it('resumes a partial download with a Range request', async () => {
    requests = []
    const dest = join(dir, 'resume.bin')
    await writeFile(`${dest}.part`, payload.subarray(0, 1000))
    await downloadFile({ url: `${base}/file`, dest, sha512 })
    expect((await readFile(dest)).equals(payload)).toBe(true)
    expect(requests.some((r) => r.includes('bytes=1000-'))).toBe(true)
  })

  it('retries transient server errors', async () => {
    failFirst = true
    const dest = join(dir, 'flaky.bin')
    await downloadFile({ url: `${base}/flaky`, dest, sha1 }, { retries: 2 })
    expect((await readFile(dest)).equals(payload)).toBe(true)
  })

  it('rejects checksum mismatches and leaves no file behind', async () => {
    const dest = join(dir, 'bad.bin')
    await expect(downloadFile({ url: `${base}/file`, dest, sha1: '0'.repeat(40) }, { retries: 0 })).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH'
    })
    await expect(stat(dest)).rejects.toThrow()
  })

  it('surfaces HTTP errors', async () => {
    await expect(downloadFile({ url: `${base}/missing`, dest: join(dir, 'missing.bin') }, { retries: 0 })).rejects.toMatchObject({
      code: 'HTTP'
    })
  })
})

describe('downloadBatch', () => {
  it('skips verified files, downloads the rest and reports progress', async () => {
    const existing = join(dir, 'batch-existing.bin')
    await writeFile(existing, payload)
    const tasks = [
      { url: `${base}/file`, dest: existing, sha1, size: payload.length },
      { url: `${base}/file`, dest: join(dir, 'batch-1.bin'), sha1, size: payload.length },
      { url: `${base}/file`, dest: join(dir, 'batch-2.bin'), sha512, size: payload.length }
    ]
    const skipped: string[] = []
    let last: { doneFiles: number; totalFiles: number; doneBytes: number; totalBytes: number } | null = null
    await downloadBatch(tasks, {
      concurrency: 2,
      onSkip: (t) => skipped.push(t.dest),
      onProgress: (p) => (last = p)
    })
    expect(skipped).toEqual([existing])
    expect(last).not.toBeNull()
    expect(last!.doneFiles).toBe(3)
    expect(last!.totalFiles).toBe(3)
    expect(last!.doneBytes).toBe(payload.length * 3)
    expect(last!.totalBytes).toBe(payload.length * 3)
  })

  it('stops on cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      downloadBatch([{ url: `${base}/file`, dest: join(dir, 'cancel.bin'), sha1 }], {
        concurrency: 1,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
