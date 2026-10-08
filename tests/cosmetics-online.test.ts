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
let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shard-cosmetics-online-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})
afterEach(() => vi.unstubAllGlobals())

/** The hosted catalogue is unreachable, so the bundled one (cape-ohmarker: locked) is used. */
async function service(syncCape: ShardApiService['syncCape']) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  const root = await mkdtemp(join(dir, 'case-'))
  const ctx = {
    paths: { cosmetics: root, cache: root },
    resourcesDir: resolve('resources'),
    manifestUrls: () => ({ shard: '', bundledMods: '', services: '', cosmetics: 'https://meta.example/cosmetics.json' }),
    emit: vi.fn(),
    services: { shardApi: { syncCape: vi.fn(syncCape) } }
  } as unknown as AppContext
  return { cosmetics: createCosmeticsService(ctx), ctx, equippedFile: join(root, 'equipped.json') }
}

describe('equipping a cape with the Shard API', () => {
  it('equips a cape the API says you own and still writes equipped.json for the game', async () => {
    const { cosmetics, ctx, equippedFile } = await service(async () => ({ owned: ['cape-ohmarker'], shop: SHOP }))
    const state = await cosmetics.equip('cape', 'cape-ohmarker')
    expect(state.equipped.cape).toBe('cape-ohmarker')
    expect(ctx.services.shardApi.syncCape).toHaveBeenCalledWith('cape-ohmarker')
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
    expect(ctx.services.shardApi.syncCape).toHaveBeenCalledWith(null)
    await expect(cosmetics.equip('cape', 'no-such-cape')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ctx.services.shardApi.syncCape).toHaveBeenCalledTimes(1)
  })
})
