import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ShardError } from '@shared/errors'
import { CosmeticsManifestSchema, EquippedCosmeticsSchema } from '@shared/schemas/shard'
import { type Cosmetic, type CosmeticsManifest, type EquippedCosmetics } from '@shared/types'
import {
  applyEquip,
  applyToggleEmote,
  CAPE_LAYOUT_TYPES,
  defaultEquipped,
  MAX_EMOTES,
  normalizeEquipped,
  ownedIds,
  pngDimensions,
  pruneEquipped,
  resolveAssetUrl,
  toCosmeticsManifest
} from '@main/cosmetics/rules'

const NOW = '2026-10-06T12:00:00.000Z'

function cosmetic(id: string, type: Cosmetic['type'], availability: Cosmetic['availability'] = 'free'): Cosmetic {
  return {
    id,
    type,
    name: id,
    rarity: 'rare',
    textureUrl: `bundled://cosmetics/textures/${id}.png`,
    previewUrl: null,
    animated: false,
    author: 'Shard',
    description: null,
    availability,
    tags: []
  }
}

const emotes = Array.from({ length: MAX_EMOTES + 1 }, (_, index) => cosmetic(`emote-${index}`, 'emote'))

const manifest: CosmeticsManifest = {
  schemaVersion: 1,
  updatedAt: NOW,
  cosmetics: [
    cosmetic('cape-crystal', 'cape'),
    cosmetic('cape-ender', 'cape', 'locked'),
    cosmetic('cloak-shard', 'cloak'),
    cosmetic('hat-crown', 'hat'),
    cosmetic('wings-glass', 'wings'),
    cosmetic('emote-locked', 'emote', 'locked'),
    ...emotes
  ]
}

const owned = new Set(ownedIds(manifest, []))
const empty = defaultEquipped(NOW)

function expectShardError(fn: () => unknown, code: ShardError['code'], message?: string): void {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(ShardError)
    expect((err as ShardError).code).toBe(code)
    if (message) expect((err as ShardError).message).toBe(message)
    return
  }
  throw new Error(`expected ShardError ${code}`)
}

describe('ownership', () => {
  it('owns free cosmetics plus explicitly unlocked ids, in manifest order', () => {
    expect(owned.has('cape-crystal')).toBe(true)
    expect(owned.has('cape-ender')).toBe(false)
    const unlocked = ownedIds(manifest, ['cape-ender', 'not-in-manifest'])
    expect(unlocked.slice(0, 3)).toEqual(['cape-crystal', 'cape-ender', 'cloak-shard'])
    expect(unlocked).not.toContain('not-in-manifest')
  })
})

describe('applyEquip', () => {
  it('equips an owned cosmetic into its own slot', () => {
    const next = applyEquip(empty, manifest, owned, 'cape', 'cape-crystal', NOW)
    expect(next.equipped).toEqual({ cape: 'cape-crystal' })
    expect(next.updatedAt).toBe(NOW)
    expect(empty.equipped).toEqual({})
  })

  it('rejects a slot/type mismatch', () => {
    expectShardError(() => applyEquip(empty, manifest, owned, 'cloak', 'cape-crystal', NOW), 'INVALID_INPUT')
    expectShardError(() => applyEquip(empty, manifest, owned, 'hat', 'wings-glass', NOW), 'INVALID_INPUT')
  })

  it('rejects locked and unknown cosmetics', () => {
    expectShardError(
      () => applyEquip(empty, manifest, owned, 'cape', 'cape-ender', NOW),
      'INVALID_INPUT',
      'You do not own this cosmetic yet'
    )
    expectShardError(() => applyEquip(empty, manifest, owned, 'cape', 'nope', NOW), 'NOT_FOUND')
  })

  it('lets an unlock make a locked cosmetic equippable', () => {
    const unlocked = new Set(ownedIds(manifest, ['cape-ender']))
    expect(applyEquip(empty, manifest, unlocked, 'cape', 'cape-ender', NOW).equipped.cape).toBe('cape-ender')
  })

  it('keeps cape and cloak mutually exclusive but leaves other slots alone', () => {
    const withHat = applyEquip(empty, manifest, owned, 'hat', 'hat-crown', NOW)
    const withCape = applyEquip(withHat, manifest, owned, 'cape', 'cape-crystal', NOW)
    const withCloak = applyEquip(withCape, manifest, owned, 'cloak', 'cloak-shard', NOW)
    expect(withCloak.equipped).toEqual({ hat: 'hat-crown', cloak: 'cloak-shard' })
    const backToCape = applyEquip(withCloak, manifest, owned, 'cape', 'cape-crystal', NOW)
    expect(backToCape.equipped).toEqual({ hat: 'hat-crown', cape: 'cape-crystal' })
  })

  it('clears only the requested slot with null', () => {
    const state: EquippedCosmetics = { ...empty, equipped: { cape: 'cape-crystal', hat: 'hat-crown' } }
    expect(applyEquip(state, manifest, owned, 'cape', null, NOW).equipped).toEqual({ hat: 'hat-crown' })
    expect(applyEquip(state, manifest, owned, 'wings', null, NOW).equipped).toEqual(state.equipped)
  })
})

describe('applyToggleEmote', () => {
  it('adds and removes emotes', () => {
    const added = applyToggleEmote(empty, manifest, owned, 'emote-0', NOW)
    expect(added.emotes).toEqual(['emote-0'])
    expect(applyToggleEmote(added, manifest, owned, 'emote-0', NOW).emotes).toEqual([])
  })

  it('rejects non-emotes, locked emotes and unknown ids when adding', () => {
    expectShardError(() => applyToggleEmote(empty, manifest, owned, 'cape-crystal', NOW), 'INVALID_INPUT')
    expectShardError(() => applyToggleEmote(empty, manifest, owned, 'emote-locked', NOW), 'INVALID_INPUT')
    expectShardError(() => applyToggleEmote(empty, manifest, owned, 'nope', NOW), 'NOT_FOUND')
  })

  it('caps the wheel at MAX_EMOTES but always allows removal', () => {
    const full = emotes
      .slice(0, MAX_EMOTES)
      .reduce((state, emote) => applyToggleEmote(state, manifest, owned, emote.id, NOW), empty)
    expect(full.emotes).toHaveLength(MAX_EMOTES)
    expectShardError(
      () => applyToggleEmote(full, manifest, owned, `emote-${MAX_EMOTES}`, NOW),
      'INVALID_INPUT',
      `You can equip up to ${MAX_EMOTES} emotes`
    )
    const stale: EquippedCosmetics = { ...full, emotes: [...full.emotes, 'removed-from-manifest'] }
    expect(applyToggleEmote(stale, manifest, owned, 'removed-from-manifest', NOW).emotes).toEqual(full.emotes)
  })
})

describe('pruneEquipped and normalizeEquipped', () => {
  it('drops ids the manifest no longer lists and records the account', () => {
    const state: EquippedCosmetics = {
      ...empty,
      equipped: { cape: 'cape-crystal', hat: 'gone', wings: 'cape-crystal' },
      emotes: ['emote-0', 'gone', 'cape-crystal']
    }
    const pruned = pruneEquipped(state, manifest, 'acc-1', NOW)
    expect(pruned.equipped).toEqual({ cape: 'cape-crystal' })
    expect(pruned.emotes).toEqual(['emote-0'])
    expect(pruned.accountId).toBe('acc-1')
  })

  it('returns the same object when nothing changes', () => {
    const state: EquippedCosmetics = { ...empty, accountId: 'acc-1', equipped: { cape: 'cape-crystal' }, emotes: ['emote-0'] }
    expect(pruneEquipped(state, manifest, 'acc-1', NOW)).toBe(state)
    expect(pruneEquipped(state, manifest, null, NOW)).not.toBe(state)
  })

  it('normalises a validated equipped.json, dropping unknown slots and duplicate emotes', () => {
    const parsed = EquippedCosmeticsSchema.parse({
      schemaVersion: 1,
      updatedAt: NOW,
      accountId: null,
      equipped: { cape: 'cape-crystal', emote: 'emote-0', shoes: 'x', hat: '' },
      emotes: ['emote-0', 'emote-0', 'emote-1']
    })
    expect(normalizeEquipped(parsed)).toEqual({
      schemaVersion: 1,
      updatedAt: NOW,
      accountId: null,
      equipped: { cape: 'cape-crystal' },
      emotes: ['emote-0', 'emote-1']
    })
  })
})

describe('resolveAssetUrl', () => {
  it('accepts bundled and http(s) URLs only', () => {
    expect(resolveAssetUrl('bundled://cosmetics/textures/a.png')).toEqual({
      kind: 'bundled',
      relativePath: 'cosmetics/textures/a.png'
    })
    expect(resolveAssetUrl('https://cdn.example/a.png')).toEqual({ kind: 'remote', url: 'https://cdn.example/a.png' })
    expectShardError(() => resolveAssetUrl('bundled://../secrets.png'), 'MANIFEST_INVALID')
    expectShardError(() => resolveAssetUrl('bundled://'), 'MANIFEST_INVALID')
    expectShardError(() => resolveAssetUrl('file:///C:/Windows/x.png'), 'MANIFEST_INVALID')
    expectShardError(() => resolveAssetUrl('javascript:alert(1)'), 'MANIFEST_INVALID')
  })
})

describe('bundled cosmetics manifest', () => {
  const root = resolve('resources')

  it('validates and ships every referenced texture and preview', async () => {
    const raw: unknown = JSON.parse(await readFile(resolve(root, 'cosmetics', 'cosmetics.json'), 'utf8'))
    const parsed = CosmeticsManifestSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const bundled = toCosmeticsManifest(parsed.data)
    expect(bundled.cosmetics.map((c) => c.id)).toEqual(['cape-ohmarker'])

    for (const item of bundled.cosmetics) {
      for (const url of [item.textureUrl, item.previewUrl]) {
        expect(url).not.toBeNull()
        const asset = resolveAssetUrl(url ?? '')
        expect(asset.kind).toBe('bundled')
        if (asset.kind !== 'bundled') continue
        const png = await readFile(resolve(root, asset.relativePath))
        const size = pngDimensions(png)
        expect(size).not.toBeNull()
        if (url === item.textureUrl && CAPE_LAYOUT_TYPES.has(item.type)) {
          // The 64x32 cape layout at any whole multiple; the OhMarker cape is 4096x2048.
          expect(size?.width).toBe((size?.height ?? 0) * 2)
          expect((size?.width ?? 0) % 64).toBe(0)
        }
      }
    }
    // The OhMarker cape is sold for tokens by the Shard API (0.3.0), so the bundled copy is locked;
    // with the API the launcher asks it who owns what, without it the cape is not owned.
    expect(bundled.cosmetics.find((c) => c.id === 'cape-ohmarker')?.availability).toBe('locked')
  })

  it('rejects non-PNG buffers', () => {
    expect(pngDimensions(Buffer.from('not a png'))).toBeNull()
    expect(pngDimensions(Buffer.alloc(0))).toBeNull()
  })
})
