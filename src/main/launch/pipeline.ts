/**
 * The install/repair/launch pipeline: every step before the JVM is spawned. Shared by
 * `prepare()` (no session, no cosmetics) and `start()`.
 */
import { join } from 'node:path'
import { satisfies, validRange } from 'semver'
import { ShardError, type ShardErrorCode } from '@shared/errors'
import { fallbackJavaMajor } from '@shared/minecraft-version'
import { type VersionJson } from '@shared/schemas/mojang'
import {
  type AccountBridgeInfo,
  type DownloadProgress,
  type Instance,
  type JavaRuntime,
  type LaunchMode,
  type LaunchStepId,
  type ShardBuild
} from '@shared/types'
import { type AppContext, type GameSession, type ProgressSink } from '../context'
import { mergeProfiles } from '../fabric/merge'
import { fetchProfile, resolveLoader } from '../fabric/meta'
import { planAssets } from '../minecraft/assets'
import { extractNatives, nativesDirFor, planLibraries } from '../minecraft/libraries'
import { currentOs, launchFeatures } from '../minecraft/rules'
import { downloadBatch, type DownloadBatchOptions } from '../net/downloader'
import { ensureDir, exists } from '../util/fs'
import { type InstanceConsole } from './console'
import { type LaunchStateStore, STEP_LABELS } from './progress'

export interface PipelineInput {
  ctx: AppContext
  instance: Instance
  mode: LaunchMode
  signal: AbortSignal
  /** Required for launches; null while installing or repairing. */
  session: GameSession | null
  /** Account bridge for this launch, written into launcher-info.json. */
  accountBridge?: AccountBridgeInfo | null
  states: LaunchStateStore
  console: InstanceConsole
}

export interface PreparedGame {
  /** The instance record as last saved by the pipeline. */
  instance: Instance
  resolved: VersionJson
  java: JavaRuntime
  classpath: string[]
  nativesDir: string
  shardBuild: ShardBuild | null
}

/** Failures that must not block a launch when the files from a previous run are present. */
const NETWORK_CODES: ReadonlySet<ShardErrorCode> = new Set(['OFFLINE', 'HTTP', 'TIMEOUT', 'RATE_LIMITED'])

export function isNetworkError(err: ShardError): boolean {
  return NETWORK_CODES.has(err.code)
}

export async function runPipeline(input: PipelineInput): Promise<PreparedGame> {
  const { ctx, mode, signal, session, states, console: con } = input
  const instanceId = input.instance.id
  const settings = ctx.settings.get()
  const instances = ctx.services.instances
  let instance = input.instance
  const mc = instance.minecraftVersion
  const folder = instances.folder(instanceId)
  const nativesDir = nativesDirFor(folder)

  const throwIfAborted = (): void => {
    if (signal.aborted) throw new ShardError('CANCELLED', 'Cancelled')
  }

  const step = async <T>(id: LaunchStepId, fn: () => Promise<T>): Promise<T> => {
    throwIfAborted()
    states.setStep(instanceId, id, 'active', { message: STEP_LABELS[id] })
    try {
      const result = await fn()
      states.setStep(instanceId, id, 'done')
      return result
    } catch (err) {
      const error = ShardError.from(err)
      states.setStep(instanceId, id, error.code === 'CANCELLED' ? 'pending' : 'failed', { detail: error.message })
      throw error
    }
  }
  const skip = (id: LaunchStepId, detail: string): void => states.setStep(instanceId, id, 'skipped', { detail })
  const detail = (id: LaunchStepId, text: string): void => states.setStep(instanceId, id, 'done', { detail: text })

  const sink: ProgressSink = {
    signal,
    onProgress: (download, message) => states.download(instanceId, download, message),
    onMessage: (message) => states.update(instanceId, { message })
  }
  const batch = (label: string): DownloadBatchOptions => ({
    concurrency: settings.downloadConcurrency,
    signal,
    onProgress: (download: DownloadProgress) =>
      states.download(instanceId, download, `Downloading ${label} (${download.doneFiles}/${download.totalFiles})`)
  })

  const patchInstance = async (patch: Partial<Instance>): Promise<void> => {
    instance = await instances.save({ ...instances.getRaw(instanceId), ...patch })
  }

  /** Network trouble is tolerated for optional sync steps (null result); anything else still fails. */
  const tolerate = async <T>(id: LaunchStepId, what: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn()
    } catch (err) {
      const error = ShardError.from(err)
      if (!isNetworkError(error)) throw error
      con.launcher(`${what} skipped: ${error.message}`, 'warn')
      ctx.emit('app:toast', { kind: 'warning', title: `${what} skipped`, message: error.message })
      states.setStep(instanceId, id, 'done', { detail: `Skipped (${error.code.toLowerCase()})` })
      return null
    }
  }

  await ensureDir(folder)
  await ensureDir(nativesDir)

  // 1. Vanilla version metadata.
  const vanilla = await step('version', async () => {
    await ctx.services.versions.getManifestVersion(mc)
    return ctx.services.versions.getVersionJson(mc, { signal })
  })
  detail('version', `Minecraft ${mc}`)

  // 2. Fabric loader + profile (Shard instances only).
  let resolved = vanilla
  if (instance.type === 'shard') {
    resolved = await step('fabric', async () => {
      let loaderVersion = instance.fabricLoader
      if (!loaderVersion) {
        loaderVersion = (await resolveLoader(mc, signal)).loader.version
        await patchInstance({ fabricLoader: loaderVersion })
      }
      const profile = await fetchProfile(mc, loaderVersion, ctx.paths.versions, signal)
      return mergeProfiles(vanilla, profile)
    })
    detail('fabric', `Loader ${instance.fabricLoader ?? ''}`.trim())
  } else {
    skip('fabric', 'Vanilla instance')
  }

  // 3. Java runtime.
  const requiredMajor = resolved.javaVersion?.majorVersion ?? fallbackJavaMajor(mc)
  const java = await step('java', () => ctx.services.java.resolveForInstance(instance, requiredMajor, sink))
  detail('java', `Java ${java.major}${java.version ? ` (${java.version})` : ''}${java.source === 'custom' ? ', custom path' : ''}`)

  // 4. Client jar.
  const clientJar = join(ctx.paths.versions, mc, `${mc}.jar`)
  await step('client', async () => {
    const download = vanilla.downloads?.client
    if (!download) throw new ShardError('MANIFEST_INVALID', `Minecraft ${mc} has no client download`)
    await downloadBatch(
      [{ url: download.url, dest: clientJar, sha1: download.sha1, size: download.size, label: `${mc}.jar` }],
      batch('the game client')
    )
  })

  // 5. Libraries and natives.
  const os = currentOs()
  const env = { os, features: launchFeatures({ fullscreen: instance.settings.fullscreen }) }
  const libraries = planLibraries(resolved.libraries, { env, librariesDir: ctx.paths.libraries })
  await step('libraries', async () => {
    await downloadBatch([...libraries.tasks, ...libraries.nativesTasks], batch('libraries'))
    if (libraries.nativesTasks.length) await extractNatives(libraries.nativesTasks, nativesDir)
  })
  detail('libraries', `${libraries.tasks.length} libraries`)

  // 6. Assets.
  const assetCount = await step('assets', async () => {
    const plan = await planAssets(resolved, { assetsDir: ctx.paths.assets, repair: mode === 'repair', signal })
    await downloadBatch(plan.tasks, batch('assets'))
    return plan.tasks.length
  })
  detail('assets', `${assetCount} objects`)

  // 7. Bundled mods (Shard Core).
  if (instance.type === 'shard') {
    await step('mods', () =>
      tolerate('mods', 'Mod update check', async () => {
        await ctx.services.mods.syncBundled(instanceId, {
          checkUpdates: settings.autoUpdateMods && mode !== 'repair',
          signal,
          onProgress: sink.onProgress,
          onMessage: sink.onMessage
        })
      })
    )
  } else {
    skip('mods', 'Vanilla instance')
  }

  // 8. Shard client jar.
  let shardBuild: ShardBuild | null = null
  if (instance.type === 'shard') {
    shardBuild = await step('shard', () =>
      tolerate('shard', 'Shard client sync', () =>
        ctx.services.shard.sync(instance, { signal, onProgress: sink.onProgress, onMessage: sink.onMessage })
      )
    )
    if (shardBuild) {
      if (instance.shardBuild !== shardBuild.version) await patchInstance({ shardBuild: shardBuild.version })
      const range = shardBuild.fabricLoader
      if (instance.fabricLoader && validRange(range) && !satisfies(instance.fabricLoader, range, { includePrerelease: true })) {
        con.launcher(`Shard ${shardBuild.version} expects Fabric loader ${range}; this instance uses ${instance.fabricLoader}`, 'warn')
      }
      detail('shard', `Build ${shardBuild.version}`)
    } else {
      detail('shard', 'Client pending, launching with Fabric and the bundled mods')
    }
  } else {
    skip('shard', 'Vanilla instance')
  }

  // 9. Shared config layer.
  if (settings.sharedConfig && instance.settings.sharedConfig) {
    await step('config', () => ctx.services.sharedConfig.syncIn(instance))
  } else {
    skip('config', 'Disabled')
  }

  // 10. Cosmetics + launcher info (launches only).
  if (mode === 'launch' && session) {
    await step('cosmetics', async () => {
      await ctx.services.cosmetics.prepareForLaunch(session.accountId)
      await ctx.services.shard.writeLauncherInfo(instance, session, input.accountBridge ?? null)
    })
  } else {
    skip('cosmetics', 'Not needed for install')
  }

  // 11. Classpath.
  const classpath = await step('classpath', async () => {
    const entries = [...libraries.classpathEntries]
    if (!entries.includes(clientJar)) entries.push(clientJar)
    const missing: string[] = []
    for (const entry of entries) if (!(await exists(entry))) missing.push(entry)
    if (missing.length) {
      throw new ShardError('INSTANCE_BROKEN', `${missing.length} classpath file(s) are missing; repair the instance`, {
        details: { missing: missing.slice(0, 10) }
      })
    }
    return entries
  })
  detail('classpath', `${classpath.length} entries`)

  return { instance, resolved, java, classpath, nativesDir, shardBuild }
}
