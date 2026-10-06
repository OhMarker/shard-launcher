/** Minecraft version catalogue: Mojang manifest, per-version JSON, and the Install action. */
import { join } from 'node:path'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { filterSupportedVersions, pickBuildForVersion } from '@shared/minecraft-version'
import {
  VersionJsonSchema,
  VersionManifestSchema,
  type ManifestVersion,
  type VersionJson,
  type VersionManifest
} from '@shared/schemas/mojang'
import { type ShardBuild, type VersionEntry } from '@shared/types'
import { type AppContext, type VersionService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { downloadToBuffer, verifyFile } from '../net/downloader'
import { readJsonOrNull, writeFileAtomic } from '../util/fs'
import { JsonCache } from '../util/json-cache'
import { parseJsonBuffer } from './parse'

const log = createLogger('versions')

const MANIFEST_MAX_AGE_MS = 5 * 60_000

interface LoadedManifest {
  manifest: VersionManifest
  fetchedAt: string
  offline: boolean
}

export function createVersionService(ctx: AppContext): VersionService {
  const cache = new JsonCache(ctx.paths.cache)
  const versionJsons = new Map<string, VersionJson>()

  async function loadManifest(refresh = false): Promise<LoadedManifest> {
    const maxAgeMs = refresh ? 0 : MANIFEST_MAX_AGE_MS
    const result = await cache.fetch(URLS.versionManifest, VersionManifestSchema, { maxAgeMs })
    // JsonCache reports 'cache' both for a fresh hit and for a network fallback; only the
    // latter (an entry older than the max age) means Mojang could not be reached.
    const age = Date.now() - Date.parse(result.fetchedAt)
    const offline = result.source === 'cache' && (maxAgeMs === 0 || age >= maxAgeMs)
    return { manifest: result.data, fetchedAt: result.fetchedAt, offline }
  }

  async function shardManifest(): Promise<{ builds: ShardBuild[]; latest: string | null }> {
    try {
      const view = await ctx.services.shard.getManifest()
      return { builds: view.manifest?.builds ?? [], latest: view.manifest?.latest ?? null }
    } catch (err) {
      log.warn('Shard manifest unavailable while listing versions', err)
      return { builds: [], latest: null }
    }
  }

  async function getManifestVersion(id: string): Promise<ManifestVersion> {
    const { manifest } = await loadManifest()
    const entry = manifest.versions.find((v) => v.id === id)
    if (!entry) throw new ShardError('VERSION_NOT_FOUND', `Minecraft ${id} does not exist`)
    const supported = filterSupportedVersions(manifest.versions, { includeSnapshots: true })
    if (!supported.some((v) => v.id === id)) {
      throw new ShardError('VERSION_UNSUPPORTED', `Minecraft ${id} is older than 1.21 and is not supported`)
    }
    return entry
  }

  const service: VersionService = {
    async list(opts) {
      const { manifest, fetchedAt, offline } = await loadManifest(opts?.refresh ?? false)
      const includeSnapshots = opts?.includeSnapshots ?? ctx.settings.get().showSnapshots
      const supported = filterSupportedVersions(manifest.versions, { includeSnapshots })

      const { builds, latest: latestShardBuild } = await shardManifest()
      const instancesByVersion = new Map<string, string[]>()
      for (const instance of ctx.services.instances.all()) {
        const ids = instancesByVersion.get(instance.minecraftVersion) ?? []
        ids.push(instance.id)
        instancesByVersion.set(instance.minecraftVersion, ids)
      }

      const versions = await Promise.all(
        supported.map(async (v): Promise<VersionEntry> => {
          const shardBuild = pickBuildForVersion(builds, v.id)?.version ?? null
          const clientAvailable = shardBuild !== null
          const instanceIds = instancesByVersion.get(v.id) ?? []
          let diskUsageBytes: number | null = null
          if (instanceIds.length) {
            const sizes = await Promise.all(
              instanceIds.map((id) => ctx.services.instances.diskUsage(id).catch(() => 0))
            )
            diskUsageBytes = sizes.reduce((a, b) => a + b, 0)
          }
          return {
            id: v.id,
            kind: v.type === 'release' ? 'release' : 'snapshot',
            releaseTime: v.releaseTime,
            shardBuild,
            clientAvailable,
            state: instanceIds.length === 0 ? 'not-installed' : clientAvailable ? 'ready' : 'client-pending',
            instanceIds,
            diskUsageBytes,
            latest: v.id === manifest.latest.release
          }
        })
      )

      return { versions, fetchedAt, offline, latestRelease: manifest.latest.release, latestShardBuild }
    },

    getManifestVersion,

    async getVersionJson(id, opts) {
      const memo = versionJsons.get(id)
      if (memo) return memo
      const entry = await getManifestVersion(id)
      const file = join(ctx.paths.versions, id, `${id}.json`)

      if (await verifyFile(file, { sha1: entry.sha1 })) {
        const cached = await readJsonOrNull(file, VersionJsonSchema)
        if (cached) {
          versionJsons.set(id, cached)
          return cached
        }
      }

      log.info(`Downloading version JSON for ${id}`)
      const buffer = await downloadToBuffer(entry.url, { sha1: entry.sha1 }, opts?.signal)
      const parsed = parseJsonBuffer(buffer, VersionJsonSchema, `Version JSON for ${id}`)
      await writeFileAtomic(file, buffer)
      versionJsons.set(id, parsed)
      return parsed
    },

    async getLatestRelease() {
      try {
        return (await loadManifest()).manifest.latest.release
      } catch (err) {
        log.warn('Could not determine the latest release', err)
        return null
      }
    }
  }

  return service
}

export function registerVersionIpc(ctx: AppContext): void {
  handle('versions:list', (input) => ctx.services.versions.list(input))

  handle('versions:install', async ({ minecraftVersion, type, name }) => {
    await ctx.services.versions.getManifestVersion(minecraftVersion)
    const instances = ctx.services.instances
    const instance = await instances.create({
      name: name ?? instances.uniqueName(`${type === 'shard' ? 'Shard' : 'Vanilla'} ${minecraftVersion}`),
      minecraftVersion,
      type
    })
    // The renderer follows the installation through `launch:progress` (mode 'install').
    ctx.services.launcher.prepare(instance.id).catch((err: unknown) => {
      const e = ShardError.from(err)
      if (e.code !== 'CANCELLED') log.warn(`Install of ${instance.name} failed: [${e.code}] ${e.message}`)
    })
    return instance
  })
}
