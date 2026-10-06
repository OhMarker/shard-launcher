import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { LAUNCHER_INFO_FILE } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { LauncherInfoSchema, ShardManifestSchema } from '@shared/schemas/shard'
import { type Instance, type ShardBuild, type ShardManifestView } from '@shared/types'
import {
  type AppContext,
  type GameSession,
  type ProgressSink,
  type ShardClientService
} from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { downloadFile, verifyFile } from '../net/downloader'
import { ensureDir, listFiles, writeJson } from '../util/fs'
import { JsonCache } from '../util/json-cache'
import { buildLauncherInfo, selectBuild, shardJarName, staleShardJars } from './client-logic'

const log = createLogger('shard')

/** Serve the cached manifest without a network round trip when younger than this. */
const MANIFEST_MAX_AGE_MS = 10 * 60_000
const PROGRESS_INTERVAL_MS = 100

export function createShardClientService(ctx: AppContext): ShardClientService {
  let unavailableLogged = false
  /** The most recent manifest failure, so `reinstall` can surface its code instead of a generic one. */
  let lastManifestError: ShardError | null = null
  let inflight: Promise<ShardManifestView> | null = null

  async function fetchManifest(refresh: boolean): Promise<ShardManifestView> {
    const url = ctx.manifestUrls().shard
    try {
      const result = await new JsonCache(ctx.paths.cache).fetch(url, ShardManifestSchema, {
        maxAgeMs: refresh ? 0 : MANIFEST_MAX_AGE_MS
      })
      lastManifestError = null
      return { manifest: result.data, source: result.source, fetchedAt: result.fetchedAt, error: null }
    } catch (err) {
      const error = ShardError.from(err)
      lastManifestError = error
      if (!unavailableLogged) {
        unavailableLogged = true
        log.info(`Shard client manifest unavailable (${error.code}): ${error.message}`)
      }
      return { manifest: null, source: 'none', fetchedAt: null, error: error.message }
    }
  }

  function getManifest(opts: { refresh?: boolean } = {}): Promise<ShardManifestView> {
    if (inflight) return inflight
    inflight = fetchManifest(opts.refresh ?? false).finally(() => {
      inflight = null
    })
    return inflight
  }

  async function download(build: ShardBuild, dest: string, sink: ProgressSink): Promise<void> {
    if (!/^https?:\/\//i.test(build.url)) {
      throw new ShardError('MANIFEST_INVALID', `Shard build ${build.version} has a non-http download URL`)
    }
    const label = `Shard ${build.version}`
    const message = `Downloading ${label}`
    sink.onMessage?.(message)
    const startedAt = Date.now()
    let received = 0
    let lastReport = 0
    const report = (done: boolean): void => {
      const now = Date.now()
      if (!done && now - lastReport < PROGRESS_INTERVAL_MS) return
      lastReport = now
      const elapsed = (now - startedAt) / 1000
      sink.onProgress?.(
        {
          totalBytes: received,
          doneBytes: received,
          totalFiles: 1,
          doneFiles: done ? 1 : 0,
          bytesPerSecond: elapsed > 0 ? received / elapsed : 0,
          etaSeconds: null,
          currentFile: label
        },
        message
      )
    }
    await downloadFile(
      { url: build.url, dest, sha512: build.sha512, label },
      {
        signal: sink.signal,
        onBytes: (bytes) => {
          received += bytes
          report(false)
        }
      }
    )
    report(true)
    log.info(`Installed ${label} to ${dest}`)
  }

  async function sync(instance: Instance, opts: { force?: boolean } & ProgressSink = {}): Promise<ShardBuild | null> {
    if (instance.type !== 'shard') return null
    const view = await getManifest()
    if (!view.manifest) {
      log.debug(`Shard manifest unavailable; leaving the client jar of "${instance.name}" untouched`)
      return null
    }
    const build = selectBuild(view.manifest, instance.minecraftVersion)
    const modsDir = join(ctx.services.instances.folder(instance.id), 'mods')
    await ensureDir(modsDir)

    const wanted = build ? shardJarName(build.version) : null
    for (const stale of staleShardJars(await listFiles(modsDir), wanted)) {
      await rm(join(modsDir, stale), { force: true })
      log.info(`Removed stale ${stale} from "${instance.name}"`)
    }

    if (build && wanted) {
      const dest = join(modsDir, wanted)
      const upToDate = !opts.force && (await verifyFile(dest, { sha512: build.sha512 }))
      if (!upToDate) await download(build, dest, opts)
    } else {
      log.debug(`No Shard build for Minecraft ${instance.minecraftVersion} yet (client pending)`)
    }

    const nextBuild = build?.version ?? null
    if (instance.shardBuild !== nextBuild) {
      instance.shardBuild = nextBuild
      await ctx.services.instances.save(instance)
    }
    return build
  }

  return {
    getManifest,

    async buildFor(minecraftVersion) {
      const view = await getManifest()
      return selectBuild(view.manifest, minecraftVersion)
    },

    sync,

    async reinstall(instanceId) {
      const instance = ctx.services.instances.getRaw(instanceId)
      if (instance.type !== 'shard') {
        throw new ShardError('INVALID_INPUT', 'Vanilla instances do not use the Shard client')
      }
      const view = await getManifest({ refresh: true })
      if (!view.manifest) {
        throw new ShardError(
          lastManifestError?.code ?? 'OFFLINE',
          `Could not fetch the Shard client manifest: ${view.error ?? 'unknown error'}`
        )
      }
      const build = await sync(instance, { force: true })
      if (!build) {
        throw new ShardError(
          'NOT_FOUND',
          `No Shard client build exists for Minecraft ${instance.minecraftVersion} yet`
        )
      }
    },

    async writeLauncherInfo(instance, session: GameSession | null) {
      const settings = ctx.settings.get()
      const info = buildLauncherInfo({
        launcherVersion: ctx.version,
        instance,
        session: session ? { accountId: session.accountId, username: session.username } : null,
        settings: { accent: settings.accent, theme: settings.theme, sharedConfig: settings.sharedConfig },
        equippedPath: ctx.services.cosmetics.equippedPath(),
        sharedConfigDir: ctx.paths.sharedConfig,
        now: new Date()
      })
      const validated = LauncherInfoSchema.safeParse(info)
      if (!validated.success) {
        throw new ShardError('INVALID_INPUT', `${LAUNCHER_INFO_FILE} failed validation`, {
          details: validated.error.issues
        })
      }
      await writeJson(join(ctx.services.instances.folder(instance.id), LAUNCHER_INFO_FILE), validated.data)
    }
  }
}

export function registerShardIpc(ctx: AppContext): void {
  handle('shard:manifest', ({ refresh }) => ctx.services.shard.getManifest({ refresh }))
  handle('shard:buildFor', ({ minecraftVersion }) => ctx.services.shard.buildFor(minecraftVersion))
  handle('shard:reinstall', ({ instanceId }) => ctx.services.shard.reinstall(instanceId))
}
