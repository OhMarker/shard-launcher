import { beforeAll, describe, expect, it } from 'vitest'
import type {
  MinecraftProfile,
  ProfileCape,
  ProfileSkin,
  SavedSkin,
  SkinVariant
} from '@shared/types'

/** See mods-utils.test.ts for why the module is loaded through a runtime specifier. */
interface SkinsUtils {
  sortSkins: (skins: readonly SavedSkin[]) => SavedSkin[]
  activeSkin: (profile: MinecraftProfile | null | undefined) => ProfileSkin | null
  activeCape: (profile: MinecraftProfile | null | undefined) => ProfileCape | null
  toVariant: (v: 'CLASSIC' | 'SLIM') => SkinVariant
  variantLabel: (v: SkinVariant) => string
  withCapeActive: (profile: MinecraftProfile, capeId: string | null) => MinecraftProfile
  detectSlim: (data: ArrayLike<number>, width: number, height: number) => boolean | null
  isHttpUrl: (value: string) => boolean
  isValidUsername: (value: string) => boolean
  CAPE_FRONT: { x: number; y: number; w: number; h: number }
}

const specifier = '../src/renderer/src/pages/skins/skins-utils'
let u: SkinsUtils

beforeAll(async () => {
  u = (await import(specifier)) as SkinsUtils
})

function skin(overrides: Partial<SavedSkin> & { id: string }): SavedSkin {
  return {
    name: overrides.id,
    variant: 'classic',
    favorite: false,
    createdAt: '2026-01-01T00:00:00Z',
    source: 'file',
    sourceLabel: null,
    dataUrl: 'data:image/png;base64,',
    ...overrides
  }
}

const profile: MinecraftProfile = {
  id: 'uuid',
  name: 'Player',
  skins: [
    {
      id: 's1',
      state: 'INACTIVE',
      url: 'https://textures.minecraft.net/a',
      variant: 'CLASSIC',
      textureKey: null
    },
    {
      id: 's2',
      state: 'ACTIVE',
      url: 'https://textures.minecraft.net/b',
      variant: 'SLIM',
      textureKey: null
    }
  ],
  capes: [
    { id: 'c1', state: 'ACTIVE', url: 'https://textures.minecraft.net/c1', alias: 'Migrator' },
    { id: 'c2', state: 'INACTIVE', url: 'https://textures.minecraft.net/c2', alias: 'Vanilla' }
  ]
}

/** Opaque 64x64 RGBA buffer with optional transparent rectangles punched out. */
function texture(
  width: number,
  height: number,
  holes: Array<{ x: number; y: number; w: number; h: number }> = []
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const hole of holes) {
    for (let y = hole.y; y < hole.y + hole.h; y++) {
      for (let x = hole.x; x < hole.x + hole.w; x++) data[(y * width + x) * 4 + 3] = 0
    }
  }
  return data
}

describe('skins-utils', () => {
  it('sorts favorites first, then newest, then by name', () => {
    const list = [
      skin({ id: 'b', createdAt: '2026-02-01T00:00:00Z' }),
      skin({ id: 'fav', favorite: true, createdAt: '2025-01-01T00:00:00Z' }),
      skin({ id: 'a', createdAt: '2026-02-01T00:00:00Z' }),
      skin({ id: 'c', createdAt: '2026-03-01T00:00:00Z' })
    ]
    expect(u.sortSkins(list).map((s) => s.id)).toEqual(['fav', 'c', 'a', 'b'])
    expect(list.map((s) => s.id)).toEqual(['b', 'fav', 'a', 'c'])
  })

  it('reads the active skin and cape from a profile', () => {
    expect(u.activeSkin(profile)?.id).toBe('s2')
    expect(u.activeCape(profile)?.alias).toBe('Migrator')
    expect(u.activeSkin(null)).toBeNull()
    expect(u.activeCape(undefined)).toBeNull()
  })

  it('maps variants', () => {
    expect(u.toVariant('SLIM')).toBe('slim')
    expect(u.toVariant('CLASSIC')).toBe('classic')
    expect(u.variantLabel('slim')).toBe('Slim')
  })

  it('builds the optimistic cape state', () => {
    const next = u.withCapeActive(profile, 'c2')
    expect(next.capes.map((c) => c.state)).toEqual(['INACTIVE', 'ACTIVE'])
    expect(u.withCapeActive(profile, null).capes.every((c) => c.state === 'INACTIVE')).toBe(true)
    expect(profile.capes[0]!.state).toBe('ACTIVE')
  })

  it('detects slim skins from the unused arm pixels', () => {
    const classic = texture(64, 64)
    const slim = texture(64, 64, [
      { x: 50, y: 16, w: 2, h: 4 },
      { x: 54, y: 20, w: 2, h: 12 }
    ])
    const almost = texture(64, 64, [{ x: 54, y: 20, w: 2, h: 12 }])
    expect(u.detectSlim(classic, 64, 64)).toBe(false)
    expect(u.detectSlim(slim, 64, 64)).toBe(true)
    expect(u.detectSlim(almost, 64, 64)).toBe(false)
    expect(
      u.detectSlim(
        texture(64, 32, [
          { x: 50, y: 16, w: 2, h: 4 },
          { x: 54, y: 20, w: 2, h: 12 }
        ]),
        64,
        32
      )
    ).toBe(true)
    expect(u.detectSlim(texture(128, 128), 128, 128)).toBeNull()
    expect(u.detectSlim(new Uint8ClampedArray(10), 64, 64)).toBeNull()
  })

  it('validates urls and usernames', () => {
    expect(u.isHttpUrl('https://example.com/skin.png')).toBe(true)
    expect(u.isHttpUrl(' http://example.com ')).toBe(true)
    expect(u.isHttpUrl('ftp://example.com')).toBe(false)
    expect(u.isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(u.isHttpUrl('not a url')).toBe(false)
    expect(u.isValidUsername('Notch')).toBe(true)
    expect(u.isValidUsername('with_underscore_')).toBe(true)
    expect(u.isValidUsername('')).toBe(false)
    expect(u.isValidUsername('seventeen_chars__')).toBe(false)
    expect(u.isValidUsername('bad name')).toBe(false)
  })

  it('exposes the cape front region', () => {
    expect(u.CAPE_FRONT).toEqual({ x: 1, y: 1, w: 10, h: 16 })
  })
})
