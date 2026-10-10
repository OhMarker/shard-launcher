import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShardError } from '@shared/errors'
import { formatShards, formatUsd, packFor, purchaseStatusLabel, storeErrorMessage } from '@shared/online'
import { AdminStatsSchema, StorePacksSchema, StorePurchasesSchema } from '@shared/schemas/online'

const openExternal = vi.fn(async () => undefined)
vi.mock('electron', () => ({ shell: { openExternal } }))

describe('Store helpers', () => {
  it('formats dollars and Shards', () => {
    expect(formatUsd(199)).toBe('$1.99')
    expect(formatUsd(4999)).toBe('$49.99')
    expect(formatUsd(123456)).toBe('$1,234.56')
    expect(formatShards(16000)).toBe('16,000')
  })

  it('names purchase states for players', () => {
    expect(purchaseStatusLabel('paid')).toBe('Added')
    expect(purchaseStatusLabel('refunded')).toBe('Refunded')
    expect(purchaseStatusLabel('expired')).toBe('Not finished')
    expect(purchaseStatusLabel('open')).toBe('Waiting for payment')
  })

  it('picks the cheapest pack that covers what is missing', () => {
    const packs = [
      { id: 'starter', shards: 500, priceCents: 199 },
      { id: 'small', shards: 1300, priceCents: 499 },
      { id: 'mega', shards: 16000, priceCents: 4999 }
    ]
    expect(packFor(packs, 300)?.id).toBe('starter')
    expect(packFor(packs, 501)?.id).toBe('small')
    expect(packFor(packs, 99999)?.id).toBe('mega')
    expect(packFor([], 1)).toBeNull()
  })

  it('explains store errors', () => {
    const http = (status: number, message = `HTTP ${status}`) => new ShardError('HTTP', message, { details: { status } })
    expect(storeErrorMessage(http(503))).toBe('The Store is not open yet.')
    expect(storeErrorMessage(http(429))).toMatch(/Too many unfinished checkouts/)
    expect(storeErrorMessage(http(404))).toBe('That pack is not for sale any more.')
    expect(storeErrorMessage(new ShardError('OFFLINE', 'x'))).toMatch(/Could not reach/)
    expect(storeErrorMessage(new ShardError('ACCOUNT_REQUIRED', 'x'))).toMatch(/Sign in/)
    expect(storeErrorMessage(http(502))).toBe('Something went wrong talking to the Store. Try again.')
  })
})

describe('Store schemas', () => {
  it('parses packs and purchases tolerantly', () => {
    const packs = StorePacksSchema.parse({ packs: [{ id: 'medium', name: 'Medium', priceCents: 999, shards: 2800, bonusPercent: 12, bestValue: true, extra: 1 }] })
    expect(packs.open).toBe(false)
    expect(packs.packs[0]).toMatchObject({ id: 'medium', bonusPercent: 12, bestValue: true })
    const { purchases } = StorePurchasesSchema.parse({
      purchases: [{ id: 'cs_1', packId: 'small', packName: 'Small', priceCents: 499, shards: 1300, status: 'something-new', createdAt: 1 }]
    })
    expect(purchases[0]).toMatchObject({ status: 'open', creditedAt: null })
  })
  it('older APIs have no store totals', () => {
    expect(AdminStatsSchema.parse({ players: 1 })).toMatchObject({ storePurchases: 0, storeRevenueCents: 0 })
  })
})

describe('Store service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    openExternal.mockClear()
  })

  async function service(checkoutUrl: string, api = 'http://127.0.0.1:8787') {
    const { createShardApiService } = await import('@main/shard-api/shard-api')
    const me = { uuid: 'b'.repeat(32), name: 'Bob', tokens: 100, owned: [], cape: null, admin: false, role: null }
    const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    const calls: Array<{ url: string; body?: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, body: init.body as string | undefined })
        if (url.endsWith('/v1/auth/challenge')) return answer({ serverId: 'ab'.repeat(16) })
        if (url.endsWith('/v1/auth/verify')) return answer({ session: 's', me })
        if (url.endsWith('/v1/store/checkout')) return answer({ sessionId: 'cs_test_1', url: checkoutUrl })
        if (url.endsWith('/v1/store/confirm')) {
          return answer({
            credited: true,
            purchase: { id: 'cs_test_1', packId: 'small', packName: 'Small', priceCents: 499, shards: 1300, status: 'paid', createdAt: 1, creditedAt: 2 }
          })
        }
        return answer({ error: 'Not found' }, 404)
      })
    )
    vi.stubEnv('SHARD_API_URL', api)
    vi.stubEnv('SHARD_API_DEV_AUTH', '1')
    vi.stubEnv('SHARD_DEV_FAKE_ACCOUNT', `Bob:${'b'.repeat(32)}`)
    return { api: createShardApiService({ isPackaged: false, services: {}, paths: { cache: '.' } } as never), calls }
  }

  it("opens Stripe's checkout page and confirms the payment", async () => {
    const { api, calls } = await service('https://checkout.stripe.com/c/pay/cs_test_1')
    const checkout = await api.storeCheckout('small')
    expect(checkout.sessionId).toBe('cs_test_1')
    expect(openExternal).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1')
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/v1/store/checkout'))?.body ?? '{}')).toEqual({ packId: 'small' })
    const confirmed = await api.storeConfirm('cs_test_1')
    expect(confirmed).toMatchObject({ credited: true, purchase: { status: 'paid', shards: 1300 } })
  })

  it('never opens any other page', async () => {
    const { api } = await service('https://evil.example/pay')
    await expect(api.storeCheckout('small')).rejects.toThrow(/unexpected payment page/)
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('Staff pack prices', () => {
  it('reads typed dollar amounts', async () => {
    const { parseUsd } = await import('@shared/online')
    expect(parseUsd('$4.99')).toBe(499)
    expect(parseUsd('4.9')).toBe(490)
    expect(parseUsd('5')).toBe(500)
    expect(parseUsd('4.999')).toBeNull()
    expect(parseUsd('abc')).toBeNull()
  })
})
