import { describe, expect, it } from 'vitest'
import {
  apiSyncsSlot,
  bundleState,
  effectiveOwned,
  equipBody,
  equippedOf,
  onlineSlotOf
} from '@shared/online'
import { ShardMeSchema, ShopResponseSchema } from '@shared/schemas/online'
import { CosmeticsManifestSchema, EquippedCosmeticsSchema, parseCosmeticEntries } from '@shared/schemas/shard'
import { type Cosmetic, type ShopItem } from '@shared/types'
import { URLS } from '@shared/constants'
import {
  applyEquip,
  COSMETIC_SLOTS,
  cosmeticsV2Url,
  defaultEquipped,
  normalizeEquipped,
  toCosmeticsManifest
} from '@main/cosmetics/rules'
import {
  DEFAULT_FILTERS,
  TYPE_FILTERS,
  bundleConfirmMessage,
  bundleHeadline,
  bundleNote,
  countByType,
  equipAction,
  featuredBundles,
  filterCosmetics,
  isEquippedIn,
  slotOf
} from '@/pages/cosmetics/cosmetics-utils'

const NOW = '2026-10-09T12:00:00.000Z'
const SET = ['cape-ohmarker', 'shield-ohmarker', 'bandana-ohmarker']

function item(id: string, type: Cosmetic['type'], extra: Partial<Cosmetic> = {}): Cosmetic {
  return {
    id,
    type,
    name: id,
    rarity: 'mythic',
    textureUrl: type === 'bundle' ? null : `https://meta.example/${id}.png`,
    previewUrl: null,
    animated: false,
    author: 'OhMarker',
    description: null,
    availability: 'locked',
    tags: ['ohmarker-set'],
    ...extra
  }
}

const CAPE = item('cape-ohmarker', 'cape', { name: 'OhMarker Cape' })
const SHIELD = item('shield-ohmarker', 'shield', { name: 'OhMarker Shield' })
const BANDANA = item('bandana-ohmarker', 'bandana', { name: 'OhMarker Bandana' })
const BUNDLE = item('bundle-ohmarker', 'bundle', { name: 'OhMarker Set', items: SET })
const CATALOGUE = [CAPE, SHIELD, BANDANA, BUNDLE]
const SHOP: ShopItem[] = [
  { id: 'bandana-ohmarker', price: 1000, basePrice: 1000, salePercent: 0 },
  { id: 'bundle-ohmarker', price: 2000, basePrice: 2000, salePercent: 0, items: ['bandana-ohmarker', 'cape-ohmarker', 'shield-ohmarker'] },
  { id: 'cape-ohmarker', price: 1000, basePrice: 1000, salePercent: 0 },
  { id: 'shield-ohmarker', price: 1000, basePrice: 1000, salePercent: 0 }
]
const NAMES = new Map(CATALOGUE.map((c) => [c.id, c.name]))

describe('catalogue schema tolerance', () => {
  const raw = (type: string, extra: Record<string, unknown> = {}) => ({
    id: `${type}-x`,
    type,
    name: type,
    rarity: 'rare',
    textureUrl: `https://meta.example/${type}.png`,
    ...extra
  })

  it('accepts shields, bandanas and bundles (no texture, with items)', () => {
    const { cosmetics, skipped } = parseCosmeticEntries([
      raw('shield'),
      raw('bandana'),
      raw('bundle', { textureUrl: null, items: ['shield-x', 'bandana-x'] })
    ])
    expect(skipped).toBe(0)
    expect(cosmetics.map((c) => c.type)).toEqual(['shield', 'bandana', 'bundle'])
    expect(cosmetics[2]).toMatchObject({ textureUrl: null, items: ['shield-x', 'bandana-x'] })
    expect(cosmetics[0]?.items).toBeUndefined()
  })

  it('skips unknown types and broken entries instead of failing the whole file', () => {
    const payload = CosmeticsManifestSchema.parse({
      schemaVersion: 3,
      updatedAt: NOW,
      cosmetics: [
        raw('cape'),
        raw('aura'),
        raw('hat', { rarity: 'ultra' }),
        raw('wings', { textureUrl: null }),
        raw('bundle', { textureUrl: null }),
        'not an object',
        raw('cape', { name: 'Duplicate id' })
      ]
    })
    const manifest = toCosmeticsManifest(payload)
    expect(manifest.schemaVersion).toBe(3)
    expect(manifest.cosmetics.map((c) => c.id)).toEqual(['cape-x'])
    expect(manifest.cosmetics[0]?.name).toBe('cape')
  })

  it('still rejects a file that is not a catalogue at all', () => {
    expect(CosmeticsManifestSchema.safeParse({ updatedAt: NOW, cosmetics: [] }).success).toBe(false)
    expect(CosmeticsManifestSchema.safeParse({ schemaVersion: 1, updatedAt: NOW, cosmetics: {} }).success).toBe(false)
  })

  it('finds cosmetics-v2.json next to a custom cosmetics.json, or uses the override', () => {
    expect(cosmeticsV2Url(null, null)).toBe(URLS.cosmeticsV2)
    expect(cosmeticsV2Url('http://127.0.0.1:9000/v2.json', 'https://x.example/cosmetics.json')).toBe(
      'http://127.0.0.1:9000/v2.json'
    )
    expect(cosmeticsV2Url(null, 'https://x.example/meta/cosmetics.json')).toBe('https://x.example/meta/cosmetics-v2.json')
    expect(cosmeticsV2Url(null, 'https://x.example/catalogue.json')).toBeNull()
  })
})

describe('Shard API shapes for the set', () => {
  const me = { uuid: 'a'.repeat(32), name: 'OhMarkerr', tokens: 5, owned: [], cape: 'cape-ohmarker', admin: false }

  it('reads equipped slots, and falls back to the cape for older APIs', () => {
    const fresh = ShardMeSchema.parse({ ...me, equipped: { cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: null } })
    expect(equippedOf(fresh)).toEqual({ cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: null })
    const old = ShardMeSchema.parse(me)
    expect(old.equipped).toBeUndefined()
    expect(equippedOf(old)).toEqual({ cape: 'cape-ohmarker', shield: null, bandana: null })
  })

  it('keeps bundle items from the shop', () => {
    expect(ShopResponseSchema.parse({ items: SHOP }).items[1]?.items).toHaveLength(3)
  })

  it('sends { cape } for capes (every API reads it) and { slot, id } for the new slots', () => {
    expect(equipBody('cape', 'cape-ohmarker')).toEqual({ cape: 'cape-ohmarker' })
    expect(equipBody('cape', null)).toEqual({ cape: null })
    expect(equipBody('shield', 'shield-ohmarker')).toEqual({ slot: 'shield', id: 'shield-ohmarker' })
    expect(equipBody('bandana', null)).toEqual({ slot: 'bandana', id: null })
  })

  it('syncs only what the shop sells, and never clears a shield on an API without shields', () => {
    const oldShop: ShopItem[] = [{ id: 'cape-ohmarker', price: 1000, basePrice: 1000, salePercent: 0 }]
    expect(apiSyncsSlot('shield', 'shield-ohmarker', SHOP)).toBe(true)
    expect(apiSyncsSlot('shield', null, SHOP)).toBe(true)
    expect(apiSyncsSlot('shield', 'shield-ohmarker', oldShop)).toBe(false)
    expect(apiSyncsSlot('shield', null, oldShop)).toBe(false)
    expect(apiSyncsSlot('cape', null, oldShop)).toBe(true)
    expect(apiSyncsSlot('bandana', 'bandana-free', SHOP)).toBe(false)
    expect(onlineSlotOf('bandana-ohmarker')).toBe('bandana')
    expect(onlineSlotOf('bundle-ohmarker')).toBeNull()
  })
})

describe('bundle pricing and ownership', () => {
  it('owning nothing: 2000 for the set, saving 1000', () => {
    const state = bundleState(BUNDLE, [], SHOP, 2500)
    expect(state).toMatchObject({ complete: false, price: 2000, missingPrice: 3000, saving: 1000 })
    expect(state.missing).toEqual(SET)
    expect(state.buy).toEqual({ kind: 'buy', price: 2000 })
    expect(bundleHeadline('OhMarker Set', state)).toBe('OhMarker Set — 2000 Shards · save 1000')
    expect(bundleNote(state)).toBeNull()
  })

  it('too few tokens: Need N more', () => {
    expect(bundleState(BUNDLE, [], SHOP, 1200).buy).toEqual({ kind: 'short', price: 2000, need: 800 })
  })

  it('owning the cape: still 2000, the same as the two missing items', () => {
    const state = bundleState(BUNDLE, ['cape-ohmarker'], SHOP, 5000)
    expect(state).toMatchObject({ price: 2000, missingPrice: 2000, saving: null })
    expect(state.items.find((i) => i.id === 'cape-ohmarker')?.owned).toBe(true)
    expect(bundleHeadline('OhMarker Set', state)).toBe('OhMarker Set — 2000 Shards')
    expect(bundleNote(state)).toBe('Same price as the 2 items you are missing.')
  })

  it('owning two: points at the cheaper single item, also in the confirm message', () => {
    const state = bundleState(BUNDLE, ['cape-ohmarker', 'shield-ohmarker'], SHOP, 5000)
    expect(state.missing).toEqual(['bandana-ohmarker'])
    expect(bundleNote(state)).toBe('You only need 1 item; it costs 1000 on its own.')
    expect(bundleConfirmMessage(state, 5000, NAMES)).toBe(
      'It costs 2000 Shards and gives you OhMarker Bandana. You will have 3000 left. Buying it one by one costs 1000.'
    )
    expect(bundleConfirmMessage(bundleState(BUNDLE, [], SHOP, 5000), 5000, NAMES)).toBe(
      'It costs 2000 Shards and gives you OhMarker Cape, OhMarker Shield, OhMarker Bandana. You will have 3000 left.'
    )
  })

  it('owning everything (or the API listing the bundle): Owned, nothing to buy', () => {
    const all = bundleState(BUNDLE, SET, SHOP, 0)
    expect(all).toMatchObject({ complete: true, missing: [], saving: null, buy: { kind: 'owned' } })
    expect(bundleHeadline('OhMarker Set', all)).toBe('OhMarker Set')
    expect(bundleNote(all)).toBe('You own everything in this set.')
    expect(bundleState(BUNDLE, ['bundle-ohmarker'], SHOP, 0).complete).toBe(true)
  })

  it('uses the shop items when the catalogue entry lists none', () => {
    const bare = { id: 'bundle-ohmarker', items: undefined }
    expect(bundleState(bare, [], SHOP, 0).items.map((i) => i.id)).toEqual(SHOP[1]?.items)
  })

  it('signed out or no API: shows items from the catalogue, no buy state', () => {
    const state = bundleState(BUNDLE, [], [], null)
    expect(state.items.map((i) => i.id)).toEqual(SET)
    expect(state).toMatchObject({ price: null, buy: null, saving: null, missingPrice: null })
    expect(bundleHeadline('OhMarker Set', state)).toBe('OhMarker Set')
  })

  it('the bundle is owned only when the API says so (it lists it once every item is owned)', () => {
    expect(effectiveOwned(CATALOGUE, [], { owned: SET, shop: SHOP })).toEqual(SET)
    expect(effectiveOwned(CATALOGUE, [], { owned: [...SET, 'bundle-ohmarker'], shop: SHOP })).toContain('bundle-ohmarker')
    expect(effectiveOwned(CATALOGUE, [], null)).toEqual([])
  })
})

describe('equip slots', () => {
  const owned = new Set(SET)

  it('has shield and bandana slots, never a bundle slot', () => {
    expect(COSMETIC_SLOTS).toContain('shield')
    expect(COSMETIC_SLOTS).toContain('bandana')
    expect(COSMETIC_SLOTS).not.toContain('bundle')
    expect(slotOf('shield')).toBe('shield')
    expect(slotOf('bundle')).toBeNull()
    expect(slotOf('emote')).toBeNull()
  })

  it('keeps one item per slot; shield and bandana do not clear the cape', () => {
    const spare = item('shield-spare', 'shield')
    const manifest = { cosmetics: [...CATALOGUE, spare] }
    const all = new Set([...SET, spare.id])
    let state = applyEquip(defaultEquipped(NOW), manifest, all, 'cape', 'cape-ohmarker', NOW)
    state = applyEquip(state, manifest, all, 'shield', 'shield-ohmarker', NOW)
    state = applyEquip(state, manifest, all, 'bandana', 'bandana-ohmarker', NOW)
    expect(state.equipped).toEqual({ cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: 'bandana-ohmarker' })
    state = applyEquip(state, manifest, all, 'shield', 'shield-spare', NOW)
    expect(state.equipped.shield).toBe('shield-spare')
    state = applyEquip(state, manifest, all, 'shield', null, NOW)
    expect(state.equipped).toEqual({ cape: 'cape-ohmarker', bandana: 'bandana-ohmarker' })
  })

  it('refuses a bundle or a wrong-type item in a slot, and unowned items', () => {
    const manifest = { cosmetics: CATALOGUE }
    const start = defaultEquipped(NOW)
    expect(() => applyEquip(start, manifest, owned, 'cape', 'bundle-ohmarker', NOW)).toThrow(/bundle, not a cape/)
    expect(() => applyEquip(start, manifest, owned, 'bandana', 'shield-ohmarker', NOW)).toThrow(/shield, not a bandana/)
    expect(() => applyEquip(start, manifest, new Set(), 'shield', 'shield-ohmarker', NOW)).toThrow(/do not own/)
  })

  it('equipped.json keeps shield and bandana next to the cape', () => {
    const file = EquippedCosmeticsSchema.parse({
      schemaVersion: 1,
      updatedAt: NOW,
      accountId: null,
      equipped: { cape: 'cape-ohmarker', shield: 'shield-ohmarker', bandana: 'bandana-ohmarker', bundle: 'bundle-ohmarker' },
      emotes: []
    })
    expect(normalizeEquipped(file).equipped).toEqual({
      cape: 'cape-ohmarker',
      shield: 'shield-ohmarker',
      bandana: 'bandana-ohmarker'
    })
  })

  it('Equip replaces the slot, Unequip clears it, bundles have no button', () => {
    expect(equipAction(SHIELD, {})).toEqual({ type: 'shield', id: 'shield-ohmarker', replaces: null })
    expect(equipAction(SHIELD, { shield: 'shield-old' })).toEqual({
      type: 'shield',
      id: 'shield-ohmarker',
      replaces: 'shield-old'
    })
    expect(equipAction(SHIELD, { shield: 'shield-ohmarker' })).toEqual({ type: 'shield', id: null, replaces: null })
    expect(equipAction(BUNDLE, {})).toBeNull()
    expect(isEquippedIn(BANDANA, { bandana: 'bandana-ohmarker' }, [])).toBe(true)
    expect(isEquippedIn(BANDANA, { cape: 'bandana-ohmarker' }, [])).toBe(false)
    expect(isEquippedIn(BUNDLE, { cape: 'bundle-ohmarker' }, [])).toBe(false)
  })
})

describe('wardrobe with a bundle', () => {
  it('lists Shield and Bandana tabs, and the bundle only as a featured card', () => {
    expect(TYPE_FILTERS).toContain('shield')
    expect(TYPE_FILTERS).not.toContain('bundle')
    const counts = countByType(CATALOGUE)
    expect(counts).toMatchObject({ all: 3, cape: 1, shield: 1, bandana: 1 })
    expect(filterCosmetics(CATALOGUE, DEFAULT_FILTERS, []).map((c) => c.id)).not.toContain('bundle-ohmarker')
    expect(featuredBundles(CATALOGUE, DEFAULT_FILTERS, [])).toEqual([BUNDLE])
  })

  it('shows the bundle on the tab of one of its items, matching search, and "Owned only" when complete', () => {
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, type: 'shield' }, [])).toEqual([BUNDLE])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, type: 'emote' }, [])).toEqual([])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, query: 'set' }, [])).toEqual([BUNDLE])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, query: 'zzz' }, [])).toEqual([])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, ownedOnly: true }, SET)).toEqual([])
    expect(featuredBundles(CATALOGUE, { ...DEFAULT_FILTERS, ownedOnly: true }, [...SET, BUNDLE.id])).toEqual([BUNDLE])
  })
})
