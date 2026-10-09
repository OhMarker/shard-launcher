import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShardError } from '@shared/errors'
import {
  EMPTY_CODE_DRAFT,
  apiError,
  codeStatus,
  draftFromCode,
  fromDateTimeLocal,
  normalizePromoCode,
  redeemErrorMessage,
  saleDisplay,
  salePrice,
  toDateTimeLocal,
  validateCodeDraft
} from '@shared/online'
import {
  AdminShopResponseSchema,
  AdminStatsSchema,
  PromoCodesResponseSchema,
  RedeemResponseSchema,
  ShopResponseSchema
} from '@shared/schemas/online'
import { parseCosmeticEntries } from '@shared/schemas/shard'
import { type Cosmetic, type PromoCode } from '@shared/types'
import {
  DEFAULT_FILTERS,
  RARITY_PALETTE,
  RARITY_RANK,
  countByType,
  featuredBundles,
  filterCosmetics,
  typeFilterLabel
} from '@/pages/cosmetics/cosmetics-utils'
import { parsePrice, parseSalePercent } from '@/pages/admin/shop-utils'

function item(id: string, type: Cosmetic['type'], extra: Partial<Cosmetic> = {}): Cosmetic {
  return {
    id,
    type,
    name: id,
    rarity: 'special',
    textureUrl: type === 'bundle' ? null : `https://meta.example/${id}.png`,
    previewUrl: null,
    animated: false,
    author: 'OhMarker',
    description: null,
    availability: 'locked',
    tags: ['halloween', 'special'],
    ...extra
  }
}

const H_CAPE = item('cape-halloween', 'cape', { name: 'Halloween Cape' })
const H_SHIELD = item('shield-halloween', 'shield', { name: 'Halloween Shield' })
const H_BANDANA = item('bandana-halloween', 'bandana', { name: 'Halloween Bandana' })
const H_BUNDLE = item('bundle-halloween', 'bundle', {
  name: 'Halloween Set',
  items: ['cape-halloween', 'shield-halloween', 'bandana-halloween']
})
const OHM_CAPE = item('cape-ohmarker', 'cape', { name: 'OhMarker Cape', rarity: 'mythic', tags: [] })
const OHM_BUNDLE = item('bundle-ohmarker', 'bundle', { name: 'OhMarker Set', rarity: 'mythic', items: ['cape-ohmarker'], tags: [] })
const OCEAN = item('cape-ocean', 'cape', { name: 'Moonlit Tide Cape', rarity: 'epic', tags: [] })
const CATALOGUE = [OHM_CAPE, OCEAN, H_CAPE, H_SHIELD, H_BANDANA, OHM_BUNDLE, H_BUNDLE]

describe('special rarity', () => {
  it('parses catalogue entries with rarity "special" and still skips unknown rarities one by one', () => {
    const { cosmetics, skipped } = parseCosmeticEntries([
      { ...H_BANDANA },
      { ...H_BUNDLE },
      { ...H_CAPE, id: 'cape-future', rarity: 'ultra' },
      { ...OCEAN }
    ])
    expect(cosmetics.map((c) => [c.id, c.rarity])).toEqual([
      ['bandana-halloween', 'special'],
      ['bundle-halloween', 'special'],
      ['cape-ocean', 'epic']
    ])
    expect(skipped).toBe(1)
  })

  it('sorts above mythic and has its own glowing two-colour badge', () => {
    expect(RARITY_RANK.special).toBeGreaterThan(RARITY_RANK.mythic)
    expect(RARITY_PALETTE.special.label).toBe('Special')
    expect(RARITY_PALETTE.special.gradient).toMatch(/^linear-gradient\(/)
    expect(RARITY_PALETTE.special.glow).not.toBeNull()
    expect(RARITY_PALETTE.mythic.gradient).toBeNull()
    const sorted = filterCosmetics(CATALOGUE, DEFAULT_FILTERS, []).map((c) => c.rarity)
    expect(sorted.indexOf('special')).toBeLessThan(sorted.indexOf('mythic'))
  })

  it('has a Special tab with only special items and the special bundles', () => {
    const special = { ...DEFAULT_FILTERS, type: 'special' as const }
    expect(typeFilterLabel('special')).toBe('Special')
    expect(countByType(CATALOGUE)).toMatchObject({ all: 5, special: 3, cape: 3 })
    expect(filterCosmetics(CATALOGUE, special, []).map((c) => c.id).sort()).toEqual([
      'bandana-halloween',
      'cape-halloween',
      'shield-halloween'
    ])
    expect(featuredBundles(CATALOGUE, special, [])).toEqual([H_BUNDLE])
  })

  it('shows every bundle on the All tab, and each bundle on the tabs of its items', () => {
    expect(featuredBundles(CATALOGUE, DEFAULT_FILTERS, [])).toEqual([OHM_BUNDLE, H_BUNDLE])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, type: 'shield' }, [])).toEqual([H_BUNDLE])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, type: 'cape' }, [])).toEqual([OHM_BUNDLE, H_BUNDLE])
  })
})

describe('shop sales', () => {
  it('reads older shop answers as "no sale"', () => {
    const { items } = ShopResponseSchema.parse({ items: [{ id: 'cape-ohmarker', price: 1000 }] })
    expect(items).toEqual([{ id: 'cape-ohmarker', price: 1000, basePrice: 1000, salePercent: 0 }])
  })

  it('reads sale fields, and ignores a broken sale percentage', () => {
    const { items } = ShopResponseSchema.parse({
      items: [
        { id: 'cape-ocean', price: 800, basePrice: 1000, salePercent: 20 },
        { id: 'bundle-halloween', price: 2500, basePrice: 2500, salePercent: 'lots', items: ['cape-halloween'] }
      ]
    })
    expect(items[0]).toEqual({ id: 'cape-ocean', price: 800, basePrice: 1000, salePercent: 20 })
    expect(items[1]).toMatchObject({ basePrice: 2500, salePercent: 0, items: ['cape-halloween'] })
  })

  it('fills admin shop fields an older or partial answer leaves out', () => {
    const { items } = AdminShopResponseSchema.parse({
      items: [{ id: 'cape-shard', price: 1500 }, { id: 'cape-halloween', price: 900, basePrice: 1200, salePercent: 25, hidden: true, sold: 7 }]
    })
    expect(items[0]).toEqual({ id: 'cape-shard', price: 1500, basePrice: 1500, salePercent: 0, hidden: false, sold: 0 })
    expect(items[1]).toMatchObject({ hidden: true, sold: 7, salePercent: 25 })
  })

  it('computes the sale price like the API and shows the old price with a badge', () => {
    expect(salePrice(1000, 20)).toBe(800)
    expect(salePrice(999, 33)).toBe(669)
    expect(salePrice(1000, 95)).toBe(100)
    expect(salePrice(1000, -5)).toBe(1000)
    expect(saleDisplay({ price: 800, basePrice: 1000, salePercent: 20 })).toEqual({ price: 800, was: 1000, badge: '-20%' })
    expect(saleDisplay({ price: 1000, basePrice: 1000, salePercent: 0 })).toEqual({ price: 1000, was: null, badge: null })
    expect(saleDisplay({ price: 1000 })).toEqual({ price: 1000, was: null, badge: null })
  })

  it('parses the staff price and sale inputs', () => {
    expect(parsePrice('1000')).toBe(1000)
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('1.5')).toBeNull()
    expect(parsePrice('2000000')).toBeNull()
    expect(parseSalePercent('')).toBe(0)
    expect(parseSalePercent('90')).toBe(90)
    expect(parseSalePercent('91')).toBeNull()
    expect(parseSalePercent('-1')).toBeNull()
  })
})

describe('redeeming codes', () => {
  const me = { uuid: 'a'.repeat(32), name: 'Bob', tokens: 100, owned: ['bandana-halloween'], cape: null, admin: false }

  it('parses the redeem answer', () => {
    const parsed = RedeemResponseSchema.parse({ granted: { tokens: 100, items: ['bandana-halloween'] }, me })
    expect(parsed.granted).toEqual({ tokens: 100, items: ['bandana-halloween'] })
    expect(parsed.me.tokens).toBe(100)
    expect(RedeemResponseSchema.parse({ granted: {}, me }).granted).toEqual({ tokens: 0, items: [] })
  })

  it('maps each refusal to a readable message', () => {
    const fromApi = (status: number, error?: string) => apiError(status, error ? JSON.stringify({ error }) : '')
    expect(redeemErrorMessage(fromApi(404, 'That code does not exist'))).toBe('That code does not exist.')
    expect(redeemErrorMessage(fromApi(404))).toBe('That code does not exist.')
    expect(redeemErrorMessage(fromApi(409))).toBe('You already used this code.')
    expect(redeemErrorMessage(fromApi(410))).toBe('That code has expired.')
    expect(redeemErrorMessage(fromApi(429))).toBe('That code has been used up.')
    expect(redeemErrorMessage(fromApi(429, 'That code has been used up'))).toBe('That code has been used up.')
    expect(redeemErrorMessage(fromApi(503))).toMatch(/Could not reach the Shard server/)
    expect(redeemErrorMessage(new ShardError('ACCOUNT_REQUIRED', 'x'))).toMatch(/Sign in/)
  })

  it('cleans up what players type', () => {
    expect(normalizePromoCode('  halloween ')).toBe('HALLOWEEN')
    expect(normalizePromoCode('ab')).toBeNull()
    expect(normalizePromoCode('no spaces')).toBeNull()
    expect(normalizePromoCode('summer_2026-x')).toBe('SUMMER_2026-X')
  })
})

describe('staff code form', () => {
  const NOW = new Date(2026, 9, 9, 12, 0).getTime()
  const draft = { ...EMPTY_CODE_DRAFT, code: 'spooky', tokens: '100', items: ['bandana-halloween'] }

  it('builds the request body', () => {
    const result = validateCodeDraft({ ...draft, maxUses: '50', expiresAt: '2026-10-31T23:59', note: '  stream  ' }, { now: NOW })
    expect(result).toEqual({
      ok: true,
      input: {
        code: 'SPOOKY',
        tokens: 100,
        items: ['bandana-halloween'],
        maxUses: 50,
        expiresAt: new Date(2026, 9, 31, 23, 59).getTime(),
        active: true,
        note: 'stream'
      }
    })
  })

  it('refuses what the API would refuse', () => {
    const errors = (d: Partial<typeof draft>, opts = { now: NOW }) => {
      const r = validateCodeDraft({ ...draft, ...d }, opts)
      return r.ok ? {} : r.errors
    }
    expect(errors({ code: 'x' })).toHaveProperty('code')
    expect(errors({ tokens: '-5' })).toHaveProperty('tokens')
    expect(errors({ tokens: '1.5' })).toHaveProperty('tokens')
    expect(errors({ tokens: '0', items: [] })).toEqual({ items: 'A code must give tokens or an item' })
    expect(errors({ items: Array.from({ length: 21 }, (_, i) => `cape-${i}`) })).toHaveProperty('items')
    expect(errors({ maxUses: '0' })).toHaveProperty('maxUses')
    expect(errors({ expiresAt: '2026-10-01T00:00' })).toEqual({ expiresAt: 'That time has already passed' })
    // Editing an expired code may keep its date.
    expect(validateCodeDraft({ ...draft, expiresAt: '2026-10-01T00:00' }, { now: NOW, editing: true }).ok).toBe(true)
    expect(errors({ expiresAt: 'soon' })).toHaveProperty('expiresAt')
    expect(errors({ note: 'x'.repeat(201) })).toHaveProperty('note')
    expect(validateCodeDraft({ ...draft, tokens: '', items: ['a-b'] }).ok).toBe(true)
  })

  it('round-trips expiry times and fills the form from a code', () => {
    const at = new Date(2026, 9, 31, 23, 59).getTime()
    expect(toDateTimeLocal(at)).toBe('2026-10-31T23:59')
    expect(fromDateTimeLocal('2026-10-31T23:59')).toBe(at)
    expect(fromDateTimeLocal('2026-02-31T10:00')).toBeNull()
    expect(toDateTimeLocal(null)).toBe('')
    const code: PromoCode = {
      code: 'HALLOWEEN',
      tokens: 100,
      items: ['bandana-halloween'],
      maxUses: null,
      expiresAt: at,
      round: 2,
      active: false,
      note: 'starter',
      usesThisRound: 3,
      usesTotal: 10,
      createdAt: 1
    }
    expect(draftFromCode(code)).toEqual({
      code: 'HALLOWEEN',
      tokens: '100',
      items: ['bandana-halloween'],
      maxUses: '',
      expiresAt: '2026-10-31T23:59',
      active: false,
      note: 'starter'
    })
  })

  it('names each code state', () => {
    const base = { active: true, expiresAt: null, maxUses: null, usesThisRound: 0 }
    expect(codeStatus(base, NOW)).toBe('active')
    expect(codeStatus({ ...base, active: false }, NOW)).toBe('off')
    expect(codeStatus({ ...base, expiresAt: NOW - 1 }, NOW)).toBe('expired')
    expect(codeStatus({ ...base, maxUses: 5, usesThisRound: 5 }, NOW)).toBe('used-up')
  })

  it('parses staff lists and stats tolerantly', () => {
    const { codes } = PromoCodesResponseSchema.parse({ codes: [{ code: 'HALLOWEEN', tokens: 100, items: ['bandana-halloween'] }] })
    expect(codes[0]).toMatchObject({ maxUses: null, expiresAt: null, round: 1, active: true, note: '', usesThisRound: 0, usesTotal: 0 })
    expect(PromoCodesResponseSchema.parse({ codes: [{ code: 'X1Y', note: null }] }).codes[0]?.note).toBe('')
    expect(AdminStatsSchema.parse({ players: 12 })).toEqual({
      players: 12,
      inGameNow: 0,
      activeToday: 0,
      tokensHeld: 0,
      purchases: 0,
      codeRedemptions: 0,
      staff: 0
    })
  })
})

describe('Shard API service: codes and the admin shop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the redeem request and keeps hidden items out of the public shop after a price change', async () => {
    const { createShardApiService } = await import('@main/shard-api/shard-api')
    const API = 'http://127.0.0.1:8787'
    const me = { uuid: 'b'.repeat(32), name: 'Bob', tokens: 100, owned: [], cape: null, admin: true, role: 'owner' }
    const calls: Array<{ url: string; body?: string }> = []
    const answer = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, body: init.body as string | undefined })
        if (url.endsWith('/v1/auth/challenge')) return answer({ serverId: 'ab'.repeat(16) })
        if (url.endsWith('/v1/auth/verify')) return answer({ session: 's', me })
        if (url.endsWith('/v1/redeem')) return answer({ granted: { tokens: 100, items: ['bandana-halloween'] }, me })
        if (url.endsWith('/v1/admin/price')) {
          return answer({
            items: [
              { id: 'cape-ohmarker', price: 1000, basePrice: 1000, salePercent: 0, hidden: false },
              { id: 'cape-halloween', price: 900, basePrice: 1200, salePercent: 25, hidden: true }
            ]
          })
        }
        return answer({ error: 'Not found' }, 404)
      })
    )
    vi.stubEnv('SHARD_API_URL', API)
    vi.stubEnv('SHARD_API_DEV_AUTH', '1')
    vi.stubEnv('SHARD_DEV_FAKE_ACCOUNT', `Bob:${'b'.repeat(32)}`)
    const ctx = { isPackaged: false, services: {}, paths: { cache: '.' } } as never
    const api = createShardApiService(ctx)
    const result = await api.redeem('halloween')
    expect(result.granted.items).toEqual(['bandana-halloween'])
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/v1/redeem'))?.body ?? '{}')).toEqual({ code: 'halloween' })
    const shop = await api.adminPrice('cape-ohmarker', 1000)
    expect(shop.map((s) => s.id)).toEqual(['cape-ohmarker'])
    expect(shop[0]).not.toHaveProperty('hidden')
    vi.unstubAllEnvs()
  })
})
