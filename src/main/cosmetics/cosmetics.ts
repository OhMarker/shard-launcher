import { join } from 'node:path'
import { EQUIPPED_FILE } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { effectiveOwned } from '@shared/online'
import { OwnedCosmeticsSchema } from '@shared/schemas/cosmetics-owned'
import { CosmeticsManifestSchema, EquippedCosmeticsSchema } from '@shared/schemas/shard'
import {
  ONLINE_SLOTS,
  type Cosmetic,
  type CosmeticSlot,
  type CosmeticsManifest,
  type CosmeticsView,
  type EquippedCosmetics,
  type OnlineSlot
} from '@shared/types'
import { type AppContext, type CosmeticsService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { exists, readJson, readJsonOrNull, writeJson } from '../util/fs'
import { JsonCache } from '../util/json-cache'
import { CosmeticAssets, type AssetKind } from './assets'
import {
  applyEquip,
  applyToggleEmote,
  CAPE_LAYOUT_TYPES,
  COSMETIC_SLOTS,
  defaultEquipped,
  normalizeEquipped,
  ownedIds,
  pruneEquipped,
  toCosmeticsManifest
} from './rules'

const log = createLogger('cosmetics')

const isOnlineSlot = (slot: CosmeticSlot): slot is OnlineSlot => (ONLINE_SLOTS as readonly string[]).includes(slot)

const REMOTE_MAX_AGE_MS = 6 * 60 * 60_000
/** How long the in-memory manifest is reused before the on-disk cache / network is consulted again. */
const MEMO_MAX_AGE_MS = 10 * 60_000
const OWNED_FILE = 'owned.json'
const BUNDLED_MANIFEST = join('cosmetics', 'cosmetics.json')
const ASSET_CONCURRENCY = 6

interface LoadedManifest {
  manifest: CosmeticsManifest
  source: CosmeticsView['source']
  loadedAt: number
}

async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export function createCosmeticsService(ctx: AppContext): CosmeticsService {
  const assets = new CosmeticAssets(ctx)
  let loaded: LoadedManifest | null = null
  let remoteFailureLogged = false
  let v2FailureLogged = false
  /** Writes to equipped.json are serialised so two quick clicks cannot interleave read/modify/write. */
  let chain: Promise<unknown> = Promise.resolve()

  const equippedPath = (): string => join(ctx.paths.cosmetics, EQUIPPED_FILE)
  const ownedPath = (): string => join(ctx.paths.cosmetics, OWNED_FILE)
  const now = (): string => new Date().toISOString()

  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.then(task, task)
    chain = next.catch(() => undefined)
    return next
  }

  async function fetchFrom(url: string, refresh: boolean): Promise<LoadedManifest> {
    const result = await new JsonCache(ctx.paths.cache).fetch(url, CosmeticsManifestSchema, {
      maxAgeMs: refresh ? 0 : REMOTE_MAX_AGE_MS
    })
    const manifest = toCosmeticsManifest(result.data)
    const skipped = result.data.cosmetics.length - manifest.cosmetics.length
    if (skipped > 0) log.info(`Skipped ${skipped} catalogue entries this launcher cannot use (${url})`)
    return { manifest, source: result.source, loadedAt: Date.now() }
  }

  /** cosmetics-v2.json (shields, bandanas, bundles), then cosmetics.json, then the bundled copy. */
  async function fetchManifest(refresh: boolean): Promise<LoadedManifest> {
    const urls = ctx.manifestUrls()
    if (urls.cosmeticsV2) {
      try {
        return await fetchFrom(urls.cosmeticsV2, refresh)
      } catch (err) {
        if (!v2FailureLogged) {
          v2FailureLogged = true
          const error = ShardError.from(err)
          log.info(`cosmetics-v2.json unavailable (${error.code}: ${error.message}); reading cosmetics.json`)
        }
      }
    }
    try {
      return await fetchFrom(urls.cosmetics, refresh)
    } catch (err) {
      const error = ShardError.from(err)
      if (!remoteFailureLogged) {
        remoteFailureLogged = true
        log.info(`Hosted cosmetics manifest unavailable (${error.code}: ${error.message}); using the bundled set`)
      }
      const bundled = await readJson(join(ctx.resourcesDir, BUNDLED_MANIFEST), CosmeticsManifestSchema)
      return { manifest: toCosmeticsManifest(bundled), source: 'bundled', loadedAt: Date.now() }
    }
  }

  async function getManifest(refresh: boolean): Promise<LoadedManifest> {
    if (!refresh && loaded && Date.now() - loaded.loadedAt < MEMO_MAX_AGE_MS) return loaded
    loaded = await fetchManifest(refresh)
    return loaded
  }

  async function readOwned(): Promise<string[]> {
    const path = ownedPath()
    const parsed = await readJsonOrNull(path, OwnedCosmeticsSchema)
    if (parsed) return parsed
    if (await exists(path)) log.warn(`${path} is invalid; treating it as empty`)
    else await writeJson(path, [])
    return []
  }

  async function readEquipped(): Promise<EquippedCosmetics> {
    const path = equippedPath()
    const parsed = await readJsonOrNull(path, EquippedCosmeticsSchema)
    if (parsed) return normalizeEquipped(parsed)
    if (await exists(path)) log.warn(`${path} is invalid; resetting equipped cosmetics`)
    const fresh = defaultEquipped(now())
    await writeJson(path, fresh)
    return fresh
  }

  async function writeEquipped(state: EquippedCosmetics): Promise<EquippedCosmetics> {
    await writeJson(equippedPath(), state)
    ctx.emit('cosmetics:changed', state)
    return state
  }

  async function loadOwnedSet(manifest: CosmeticsManifest): Promise<ReadonlySet<string>> {
    return new Set(ownedIds(manifest, await readOwned()))
  }

  async function collectDataUrls(cosmetics: readonly Cosmetic[], kind: AssetKind): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    await forEachLimited(cosmetics, ASSET_CONCURRENCY, async (cosmetic) => {
      try {
        out[cosmetic.id] = await assets.dataUrl(cosmetic, kind)
      } catch (err) {
        log.warn(`Could not load ${kind} for ${cosmetic.id}: ${ShardError.from(err).message}`)
      }
    })
    return out
  }

  return {
    async list(opts = {}) {
      const { manifest, source } = await getManifest(opts.refresh ?? false)
      const [owned, equipped, textures, previews] = await Promise.all([
        readOwned(),
        readEquipped(),
        collectDataUrls(
          // Capes for the model's back, shields and bandanas for the 3D preview's hand and head.
          manifest.cosmetics.filter(
            (cosmetic) =>
              CAPE_LAYOUT_TYPES.has(cosmetic.type) ||
              cosmetic.type === 'shield' ||
              cosmetic.type === 'bandana'
          ),
          'texture'
        ),
        collectDataUrls(
          manifest.cosmetics.filter((cosmetic) => cosmetic.previewUrl !== null),
          'preview'
        )
      ])
      return { manifest, owned: ownedIds(manifest, owned), equipped, source, textures, previews }
    },

    equip(slot, id) {
      return serialize(async () => {
        const { manifest } = await getManifest(false)
        const [localOwned, current] = await Promise.all([readOwned(), readEquipped()])
        if (!isOnlineSlot(slot)) {
          return writeEquipped(applyEquip(current, manifest, new Set(ownedIds(manifest, localOwned)), slot, id, now()))
        }
        // Capes, shields and bandanas are what the Shard API knows about. Validate the slot
        // locally first (ownership aside), then mirror the change to the API, which checks
        // ownership and shows it to every Shard player. equipped.json is still written: the game
        // reads it.
        applyEquip(current, manifest, new Set(manifest.cosmetics.map((c) => c.id)), slot, id, now())
        const online = await ctx.services.shardApi.syncSlot(slot, id)
        const owned = new Set(effectiveOwned(manifest.cosmetics, ownedIds(manifest, localOwned), online))
        return writeEquipped(applyEquip(current, manifest, owned, slot, id, now()))
      })
    },

    toggleEmote(id) {
      return serialize(async () => {
        const { manifest } = await getManifest(false)
        const [owned, current] = await Promise.all([loadOwnedSet(manifest), readEquipped()])
        return writeEquipped(applyToggleEmote(current, manifest, owned, id, now()))
      })
    },

    equippedPath,

    prepareForLaunch(accountId) {
      return serialize(async () => {
        const { manifest } = await getManifest(false)
        const current = await readEquipped()
        const next = pruneEquipped(current, manifest, accountId, now())
        const byId = new Map(manifest.cosmetics.map((cosmetic) => [cosmetic.id, cosmetic]))
        for (const slot of COSMETIC_SLOTS) {
          const id = next.equipped[slot]
          const cosmetic = id === undefined ? undefined : byId.get(id)
          // Every equipped item with a texture (capes, shield skins, bandanas...) is cached for the game.
          if (!cosmetic || cosmetic.textureUrl === null) continue
          try {
            await assets.ensureLocal(cosmetic, 'texture')
          } catch (err) {
            log.warn(`Could not cache texture for ${cosmetic.id}: ${ShardError.from(err).message}`)
          }
        }
        // readEquipped() already guarantees a valid file on disk; only changes need a write.
        if (next === current) return
        log.info(`Updated equipped cosmetics for launch (account ${accountId ?? 'none'})`)
        await writeEquipped(next)
      })
    }
  }
}

export function registerCosmeticsIpc(ctx: AppContext): void {
  handle('cosmetics:list', ({ refresh }) => ctx.services.cosmetics.list({ refresh }))
  handle('cosmetics:equip', ({ type, id }) => ctx.services.cosmetics.equip(type, id))
  handle('cosmetics:toggleEmote', ({ id }) => ctx.services.cosmetics.toggleEmote(id))
}
