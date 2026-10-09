import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ShardError } from '@shared/errors'
import { type AppContext, type ShardApiService } from '@main/context'
import { createCosmeticsService } from '@main/cosmetics/cosmetics'

vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('@main/ipc/router', () => ({ handle: vi.fn() }))

const SHOP = [{ id: 'cape-ohmarker', price: 1000 }]
const V2_URL = 'https://meta.example/cosmetics-v2.json'

const entry = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  name: id,
  rarity: 'mythic',
  textureUrl: `https://meta.example/cosmetics/textures/${id}.png`,
  previewUrl: null,
  availability: 'locked',
  ...extra
})

/** The OhMarker set as cosmetics-v2.json lists it, plus an entry from a future launcher. */
const V2 = {
  schemaVersion: 2,
  updatedAt: '2026-10-09T07:30:00Z',
  cosmetics: [
    entry('cape-ohmarker', 'cape'),
    entry('shield-ohmarker', 'shield'),
    entry('bandana-ohmarker', 'bandana'),
    entry('bundle-ohmarker', 'bundle', {
      textureUrl: null,
      items: ['cape-ohmarker', 'shield-ohmarker', 'bandana-ohmarker']
    }),
    entry('aura-ohmarker', 'aura')
  ]
}
const SET_SHOP = [
  { id: 'bandana-ohmarker', price: 1000 },
  { id: 'bundle-ohmarker', price: 2000, items: ['bandana-ohmarker', 'cape-ohmarker', 'shield-ohmarker'] },
  { id: 'cape-ohmarker', price: 1000 },
  { id: 'shield-ohmarker', price: 1000 }
]
let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shard-cosmetics-online-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})
afterEach(() => vi.unstubAllGlobals())

/** The hosted catalogue is unreachable, so the bundled one (cape-ohmarker: locked) is used. */
async function service(
  syncSlot: ShardApiService['syncSlot'],
  opts: { v2?: unknown } = {}
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (opts.v2 && url === V2_URL) return new Response(JSON.stringify(opts.v2), { status: 200 })
      return new Response('{}', { status: 404 })
    })
  )
  const root = await mkdtemp(join(dir, 'case-'))
  const ctx = {
    paths: { cosmetics: root, cache: root },
    resourcesDir: resolve('resources'),
    manifestUrls: () => ({
      shard: '',
      bundledMods: '',
      services: '',
      cosmetics: 'https://meta.example/cosmetics.json',
      cosmeticsV2: V2_URL
    }),
    emit: vi.fn(),
    services: { shardApi: { syncSlot: vi.fn(syncSlot) } }
  } as unknown as AppContext
  return { cosmetics: createCosmeticsService(ctx), ctx, equippedFile: join(root, 'equipped.json') }
}

describe('equipping a cape with the Shard API', () => {
  it('equips a cape the API says you own and still writes equipped.json for the game', async () => {
    const { cosmetics, ctx, equippedFile } = await service(async () => ({ owned: ['cape-ohmarker'], shop: SHOP }))
    const state = await cosmetics.equip('cape', 'cape-ohmarker')
    expect(state.equipped.cape).toBe('cape-ohmarker')
    expect(ctx.services.shardApi.syncSlot).toHaveBeenCalledWith('cape', 'cape-ohmarker')
    expect(JSON.parse(await readFile(equippedFile, 'utf8')).equipped.cape).toBe('cape-ohmarker')
  })

  it('refuses a shop cape the API does not list as owned (also when signed out)', async () => {
    const { cosmetics } = await service(async () => ({ owned: [], shop: SHOP }))
    await expect(cosmetics.equip('cape', 'cape-ohmarker')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('falls back to the catalogue when the API is unavailable (the bundled cape is locked)', async () => {
    const { cosmetics } = await service(async () => null)
    await expect(cosmetics.equip('cape', 'cape-ohmarker')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('passes API refusals through and leaves equipped.json alone', async () => {
    const { cosmetics, equippedFile } = await service(async () => {
      throw new ShardError('SHARD_API', 'You do not own that cape yet')
    })
    await expect(cosmetics.equip('cape', 'cape-ohmarker')).rejects.toMatchObject({ message: 'You do not own that cape yet' })
    await expect(readFile(equippedFile, 'utf8').then((t) => JSON.parse(t).equipped)).resolves.toEqual({})
  })

  it('unequips through the API and rejects unknown ids before calling it', async () => {
    const { cosmetics, ctx } = await service(async () => ({ owned: [], shop: SHOP }))
    expect((await cosmetics.equip('cape', null)).equipped.cape).toBeUndefined()
    expect(ctx.services.shardApi.syncSlot).toHaveBeenCalledWith('cape', null)
    await expect(cosmetics.equip('cape', 'no-such-cape')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ctx.services.shardApi.syncSlot).toHaveBeenCalledTimes(1)
  })
})

describe('the OhMarker set (cosmetics-v2.json)', () => {
  it('reads cosmetics-v2.json first and skips entry types it does not know', async () => {
    const { cosmetics } = await service(async () => null, { v2: V2 })
    const view = await cosmetics.list()
    expect(view.source).toBe('remote')
    expect(view.manifest.cosmetics.map((c) => c.id)).toEqual([
      'cape-ohmarker',
      'shield-ohmarker',
      'bandana-ohmarker',
      'bundle-ohmarker'
    ])
    expect(view.manifest.cosmetics[3]).toMatchObject({ type: 'bundle', textureUrl: null })
  })

  it('falls back to cosmetics.json, then the bundled set, when there is no v2 file', async () => {
    const { cosmetics } = await service(async () => null)
    const view = await cosmetics.list()
    expect(view.source).toBe('bundled')
    expect(view.manifest.cosmetics.map((c) => c.id)).toEqual(['cape-ohmarker'])
  })

  it('equips a shield and a bandana in their own slots, through the API, into equipped.json', async () => {
    const owned = ['cape-ohmarker', 'shield-ohmarker', 'bandana-ohmarker', 'bundle-ohmarker']
    const { cosmetics, ctx, equippedFile } = await service(async () => ({ owned, shop: SET_SHOP }), { v2: V2 })
    await cosmetics.equip('cape', 'cape-ohmarker')
    await cosmetics.equip('shield', 'shield-ohmarker')
    const state = await cosmetics.equip('bandana', 'bandana-ohmarker')
    expect(state.equipped).toEqual({ cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: 'bandana-ohmarker' })
    expect(ctx.services.shardApi.syncSlot).toHaveBeenCalledWith('shield', 'shield-ohmarker')
    expect(ctx.services.shardApi.syncSlot).toHaveBeenCalledWith('bandana', 'bandana-ohmarker')
    const file = JSON.parse(await readFile(equippedFile, 'utf8'))
    expect(file.schemaVersion).toBe(1)
    expect(file.equipped).toEqual({ cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: 'bandana-ohmarker' })

    const cleared = await cosmetics.equip('shield', null)
    expect(cleared.equipped).toEqual({ cape: 'cape-ohmarker', bandana: 'bandana-ohmarker' })
    expect(ctx.services.shardApi.syncSlot).toHaveBeenLastCalledWith('shield', null)
  })

  it('refuses a shield the API does not list as owned, and a shield in the cape slot', async () => {
    const { cosmetics } = await service(async () => ({ owned: ['cape-ohmarker'], shop: SET_SHOP }), { v2: V2 })
    await expect(cosmetics.equip('shield', 'shield-ohmarker')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(cosmetics.equip('cape', 'shield-ohmarker')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
