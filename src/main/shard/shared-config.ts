import { copyFile, stat, utimes } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ShardError } from '@shared/errors'
import { type Instance } from '@shared/types'
import { type AppContext, type SharedConfigService } from '../context'
import { createLogger } from '../logger'
import { ensureDir } from '../util/fs'
import {
  collectSharedFiles,
  isSharedConfigEnabled,
  planSync,
  type SyncDirection,
  type SyncEntry
} from './shared-config-plan'

const log = createLogger('shared-config')

/** mtime of a regular file in milliseconds, or null when it is missing or not a file. */
async function fileMtime(path: string): Promise<number | null> {
  try {
    const s = await stat(path)
    return s.isFile() ? s.mtimeMs : null
  } catch {
    return null
  }
}

/** Copies a file and carries the source mtime over, so the "newer wins" rule stays meaningful. */
export async function copyPreservingMtime(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to))
  await copyFile(from, to)
  const source = await stat(from)
  await utimes(to, source.atime, source.mtime)
}

export function createSharedConfigService(ctx: AppContext): SharedConfigService {
  async function collectEntries(instanceDir: string, sharedDir: string): Promise<SyncEntry[]> {
    const manifest = await ctx.services.mods.getBundledManifest()
    const { files, rejected } = collectSharedFiles(manifest)
    for (const entry of rejected) log.warn(`Ignoring unsafe shared config path "${entry}"`)
    return Promise.all(
      files.map(async (rel) => ({
        rel,
        sharedMtimeMs: await fileMtime(join(sharedDir, rel)),
        instanceMtimeMs: await fileMtime(join(instanceDir, rel))
      }))
    )
  }

  async function run(instance: Instance, direction: SyncDirection): Promise<void> {
    if (!isSharedConfigEnabled(ctx.settings.get().sharedConfig, instance)) return
    const instanceDir = ctx.services.instances.folder(instance.id)
    const sharedDir = ctx.paths.sharedConfig

    let entries: SyncEntry[]
    try {
      entries = await collectEntries(instanceDir, sharedDir)
    } catch (err) {
      log.warn(`Shared config sync (${direction}) skipped: ${ShardError.from(err).message}`)
      return
    }

    const plan = planSync(entries, direction)
    const [fromDir, toDir] = direction === 'in' ? [sharedDir, instanceDir] : [instanceDir, sharedDir]
    let copied = 0
    for (const rel of plan) {
      try {
        await copyPreservingMtime(join(fromDir, rel), join(toDir, rel))
        copied++
      } catch (err) {
        log.warn(`Could not sync ${rel} (${direction}) for "${instance.name}": ${ShardError.from(err).message}`)
      }
    }
    log.debug(
      `Shared config sync ${direction} for "${instance.name}": ${copied}/${plan.length} copied, ${entries.length} tracked`
    )
  }

  return {
    dir: () => ctx.paths.sharedConfig,
    syncIn: (instance) => run(instance, 'in'),
    syncOut: (instance) => run(instance, 'out')
  }
}
