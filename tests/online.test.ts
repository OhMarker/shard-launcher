import { describe, expect, it } from 'vitest'
import { ShardError } from '@shared/errors'
import {
  apiError,
  apiErrorMessage,
  buyState,
  effectiveOwned,
  isUnavailableError,
  isValidMinecraftName,
  minutesToNextTokens,
  parseFakeAccount,
  sortFriends,
  validateApiBase
} from '@shared/online'
import { ServicesJsonSchema, ShardMeSchema } from '@shared/schemas/online'
import { type Friend } from '@shared/types'

describe('validateApiBase', () => {
  it('accepts https and strips trailing slashes', () => {
    expect(validateApiBase('https://api.shard.example/')).toBe('https://api.shard.example')
    expect(validateApiBase(' https://shard-api.workers.dev/base// ')).toBe('https://shard-api.workers.dev/base')
  })

  it('rejects http, other schemes and garbage from services.json', () => {
    for (const bad of ['http://api.shard.example', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', '']) {
      expect(() => validateApiBase(bad)).toThrow(ShardError)
    }
    try {
      validateApiBase('http://api.shard.example')
    } catch (err) {
      expect(ShardError.from(err).code).toBe('SHARD_API_UNAVAILABLE')
    }
  })

  it('allows plain http only for a local development server when asked', () => {
    expect(validateApiBase('http://127.0.0.1:8787', { allowLocalHttp: true })).toBe('http://127.0.0.1:8787')
    expect(validateApiBase('http://localhost:8787/', { allowLocalHttp: true })).toBe('http://localhost:8787')
    expect(() => validateApiBase('http://127.0.0.1:8787')).toThrow()
    expect(() => validateApiBase('http://evil.example', { allowLocalHttp: true })).toThrow()
  })

  it('rejects credentials, queries and fragments', () => {
    expect(() => validateApiBase('https://user:pass@api.shard.example')).toThrow()
    expect(() => validateApiBase('https://api.shard.example/?x=1')).toThrow()
    expect(() => validateApiBase('https://api.shard.example/#x')).toThrow()
  })

  it('services.json needs an api string', () => {
    expect(ServicesJsonSchema.safeParse({ api: 'https://x.example' }).success).toBe(true)
    expect(ServicesJsonSchema.safeParse({ api: '' }).success).toBe(false)
    expect(ServicesJsonSchema.safeParse({}).success).toBe(false)
  })
})

describe('apiError', () => {
  it('keeps the API message so toasts read well', () => {
    const e = apiError(404, JSON.stringify({ error: 'Bob has not used Shard yet' }))
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toBe('Bob has not used Shard yet')
    expect(e.details).toEqual({ status: 404 })
  })

  it('maps statuses to stable codes', () => {
    const body = JSON.stringify({ error: 'x' })
    expect(apiError(400, body).code).toBe('INVALID_INPUT')
    expect(apiError(401, body).code).toBe('AUTH_FAILED')
    expect(apiError(402, body).code).toBe('SHARD_API')
    expect(apiError(403, body).code).toBe('SHARD_API')
    expect(apiError(409, body).code).toBe('SHARD_API')
    expect(apiError(429, body).code).toBe('RATE_LIMITED')
    expect(apiError(500, body).code).toBe('SHARD_API_UNAVAILABLE')
    expect(apiError(503, '').code).toBe('SHARD_API_UNAVAILABLE')
  })

  it('falls back to a readable message when the body is not the API shape', () => {
    expect(apiError(402, '<html>').message).toMatch(/HTTP 402/)
    expect(apiError(502, '').message).toMatch(/Shard server/)
    expect(apiErrorMessage('{"error":"  "}')).toBeNull()
    expect(apiErrorMessage('nope')).toBeNull()
  })

  it('treats offline, timeouts and a missing API as "unavailable"', () => {
    expect(isUnavailableError(new ShardError('OFFLINE', 'x'))).toBe(true)
    expect(isUnavailableError(new ShardError('TIMEOUT', 'x'))).toBe(true)
    expect(isUnavailableError(new ShardError('SHARD_API_UNAVAILABLE', 'x'))).toBe(true)
    expect(isUnavailableError(apiError(402, '{}'))).toBe(false)
  })
})

describe('effectiveOwned', () => {
  const catalogue = [{ id: 'cape-ohmarker' }, { id: 'free-cape' }, { id: 'old-unlock' }]
  const local = ['free-cape', 'old-unlock']

  it('without the API the catalogue (free items + local unlocks) decides', () => {
    expect(effectiveOwned(catalogue, local, null)).toEqual(['free-cape', 'old-unlock'])
  })

  it('with the API, shop items are owned only when the API says so', () => {
    const shop = [{ id: 'cape-ohmarker', price: 1000 }, { id: 'old-unlock', price: 50 }]
    expect(effectiveOwned(catalogue, local, { owned: [], shop })).toEqual(['free-cape'])
    expect(effectiveOwned(catalogue, local, { owned: ['cape-ohmarker'], shop })).toEqual(['cape-ohmarker', 'free-cape'])
  })

  it('ignores API ids the catalogue does not list', () => {
    expect(effectiveOwned(catalogue, [], { owned: ['ghost'], shop: [] })).toEqual([])
  })
})

describe('buyState', () => {
  it('covers owned, not for sale, affordable and short', () => {
    expect(buyState(1000, 0, true)).toEqual({ kind: 'owned' })
    expect(buyState(null, 5000, false)).toEqual({ kind: 'not-for-sale' })
    expect(buyState(undefined, 5000, false)).toEqual({ kind: 'not-for-sale' })
    expect(buyState(1000, 1200, false)).toEqual({ kind: 'buy', price: 1000 })
    expect(buyState(1000, 1000, false)).toEqual({ kind: 'buy', price: 1000 })
    expect(buyState(1000, 700, false)).toEqual({ kind: 'short', price: 1000, need: 300 })
  })
})

describe('minutesToNextTokens', () => {
  it('rounds up and never says 0', () => {
    expect(minutesToNextTokens(600)).toBe(10)
    expect(minutesToNextTokens(61)).toBe(2)
    expect(minutesToNextTokens(1)).toBe(1)
    expect(minutesToNextTokens(0)).toBe(1)
    expect(minutesToNextTokens(Number.NaN)).toBe(1)
  })
})

describe('sortFriends', () => {
  const f = (name: string, inGame: boolean, lastSeen: number | null): Friend => ({ uuid: name, name, inGame, lastSeen })
  it('puts players in game first, then the most recently seen, then by name', () => {
    const sorted = sortFriends([f('zed', false, null), f('amy', false, 100), f('bob', true, 50), f('cat', false, 300), f('al', false, null)])
    expect(sorted.map((x) => x.name)).toEqual(['bob', 'cat', 'amy', 'al', 'zed'])
  })
})

describe('names and the dev account', () => {
  it('validates Minecraft names like the API', () => {
    expect(isValidMinecraftName('OhMarkerr')).toBe(true)
    expect(isValidMinecraftName('a_b_1')).toBe(true)
    expect(isValidMinecraftName('')).toBe(false)
    expect(isValidMinecraftName('has space')).toBe(false)
    expect(isValidMinecraftName('x'.repeat(17))).toBe(false)
  })

  it('parses SHARD_DEV_FAKE_ACCOUNT as name:uuid', () => {
    expect(parseFakeAccount('OhMarkerr:4a5e875e-479a-43f1-bfc1-6bd326643d00')).toEqual({
      username: 'OhMarkerr',
      uuid: '4a5e875e479a43f1bfc16bd326643d00'
    })
    expect(parseFakeAccount(undefined)).toBeNull()
    expect(parseFakeAccount('OhMarkerr')).toBeNull()
    expect(parseFakeAccount('bad name:4a5e875e479a43f1bfc16c6bd326643d')).toBeNull()
    expect(parseFakeAccount('ok:not-a-uuid')).toBeNull()
    expect(parseFakeAccount('a:4a5e875e479a43f1bfc16c6bd326643d:extra')).toBeNull()
  })

  it('Me tolerates older APIs without inGame', () => {
    const parsed = ShardMeSchema.parse({
      uuid: '4a5e875e479a43f1bfc16c6bd326643d',
      name: 'OhMarkerr',
      tokens: 0,
      owned: [],
      cape: null,
      admin: true,
      secondsToNextTokens: 600
    })
    expect(parsed.inGame).toBe(false)
  })
})
