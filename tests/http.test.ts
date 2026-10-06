import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HttpError, httpJson, httpRequest, toNetworkError } from '@main/net/http'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpRequest', () => {
  it('sends the User-Agent and returns 2xx responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await httpRequest('https://example.com/x')
    expect(res.status).toBe(200)
    const init = fetchMock.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/Shard/)
  })

  it('retries 5xx with backoff and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await httpRequest('https://example.com/retry', { retries: 1 })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws HttpError for non-retryable statuses with the body attached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"nope"}', { status: 404 })))
    const err = await httpRequest('https://example.com/missing').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(404)
    expect((err as HttpError).json()).toEqual({ error: 'nope' })
  })

  it('maps 429 to RATE_LIMITED after retries are exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })))
    const err = await httpRequest('https://example.com/limit', { retries: 0 }).catch((e: unknown) => e)
    expect((err as HttpError).code).toBe('RATE_LIMITED')
  })

  it('does not throw for allowed statuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 304 })))
    const res = await httpRequest('https://example.com/etag', { allowStatus: [304] })
    expect(res.status).toBe(304)
  })
})

describe('httpJson', () => {
  it('validates the payload against the schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: '1', name: 'x' })))
    const data = await httpJson('https://example.com/p', z.object({ id: z.string(), name: z.string() }))
    expect(data).toEqual({ id: '1', name: 'x' })
  })

  it('rejects payloads that do not match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 1 })))
    await expect(httpJson('https://example.com/p', z.object({ id: z.string() }))).rejects.toMatchObject({
      code: 'MANIFEST_INVALID'
    })
  })

  it('rejects invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    await expect(httpJson('https://example.com/p', z.unknown())).rejects.toMatchObject({ code: 'MANIFEST_INVALID' })
  })
})

describe('toNetworkError', () => {
  it('maps DNS and connection failures to OFFLINE', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    expect(toNetworkError(err, 'https://example.com').code).toBe('OFFLINE')
  })
  it('maps timeouts', () => {
    const err = Object.assign(new Error('t'), { name: 'TimeoutError' })
    expect(toNetworkError(err, 'https://example.com').code).toBe('TIMEOUT')
  })
  it('maps aborts to CANCELLED', () => {
    const err = Object.assign(new Error('a'), { name: 'AbortError' })
    expect(toNetworkError(err, 'https://example.com').code).toBe('CANCELLED')
  })
})
