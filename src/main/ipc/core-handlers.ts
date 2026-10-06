import { cpus, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { app, clipboard, dialog, shell } from 'electron'
import { ShardError } from '@shared/errors'
import { type MigrationProgress, type Settings, type SystemInfo } from '@shared/types'
import { type AppContext } from '../context'
import { createLogger } from '../logger'
import { MOVABLE_DIRS, resolvePaths } from '../paths'
import { copyDir, dirSize, ensureDir, exists, removeDir } from '../util/fs'
import { handle } from './router'

const log = createLogger('core')

export function systemInfo(ctx: AppContext): SystemInfo {
  return {
    platform: process.platform as SystemInfo['platform'],
    arch: process.arch,
    totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(freemem() / 1024 / 1024),
    cpuCount: cpus().length,
    launcherVersion: ctx.version,
    electronVersion: process.versions.electron ?? '',
    dataDir: ctx.paths.dataDir,
    configDir: ctx.paths.configDir,
    logsDir: ctx.paths.logs,
    isPackaged: ctx.isPackaged,
    isDev: ctx.isDev,
    msaConfigured: ctx.msaClientId() !== null
  }
}

async function migrateDataDir(ctx: AppContext, target: string): Promise<Settings> {
  const current = ctx.paths.dataDir
  if (target === current) return ctx.settings.get()
  if (ctx.services.launcher.anyRunning()) {
    throw new ShardError('INSTANCE_RUNNING', 'Close the game before moving the data directory')
  }
  await ensureDir(target)
  const existing = await readdir(target)
  if (existing.some((n) => (MOVABLE_DIRS as readonly string[]).includes(n))) {
    throw new ShardError('ALREADY_EXISTS', 'That folder already contains Shard data. Pick an empty folder.')
  }

  let totalBytes = 0
  for (const dir of MOVABLE_DIRS) totalBytes += await dirSize(join(current, dir))
  let copiedBytes = 0
  const report = (phase: MigrationProgress['phase'], currentFile: string | null): void =>
    ctx.emit('settings:migrationProgress', { phase, copiedBytes, totalBytes, currentFile })

  report('copying', null)
  for (const dir of MOVABLE_DIRS) {
    const from = join(current, dir)
    if (!(await exists(from))) continue
    await copyDir(from, join(target, dir), {
      onFile: (rel, bytes) => {
        copiedBytes += bytes
        report('copying', `${dir}/${rel}`)
      }
    })
  }

  report('verifying', null)
  for (const dir of MOVABLE_DIRS) {
    const from = join(current, dir)
    if (!(await exists(from))) continue
    const a = await dirSize(from)
    const b = await dirSize(join(target, dir))
    if (a !== b) {
      throw new ShardError('IO', `Verification failed for ${dir}: ${a} bytes vs ${b} bytes copied`)
    }
  }

  report('cleaning', null)
  for (const dir of MOVABLE_DIRS) await removeDir(join(current, dir))

  const settings = ctx.settings.update({ dataDir: target })
  Object.assign(ctx.paths, resolvePaths(ctx.paths.configDir, target))
  report('done', null)
  log.info(`Data directory moved to ${target}`)
  return settings
}

export function registerCoreIpc(ctx: AppContext): void {
  handle('app:info', () => systemInfo(ctx))

  handle('app:openExternal', async ({ url }) => {
    if (!/^https?:\/\//i.test(url)) throw new ShardError('INVALID_INPUT', 'Only http(s) links can be opened')
    await shell.openExternal(url)
  })

  handle('app:openPath', async ({ path }) => {
    const err = await shell.openPath(path)
    if (err) throw new ShardError('IO', err)
  })

  handle('app:showItemInFolder', ({ path }) => {
    shell.showItemInFolder(path)
  })

  handle('app:pickFile', async ({ title, filters, multiple }) => {
    const win = ctx.getWindow()
    const opts = {
      title,
      filters,
      properties: multiple ? (['openFile', 'multiSelections'] as const) : (['openFile'] as const)
    }
    const result = win
      ? await dialog.showOpenDialog(win, { ...opts, properties: [...opts.properties] })
      : await dialog.showOpenDialog({ ...opts, properties: [...opts.properties] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
  })

  handle('app:pickDirectory', async ({ title }) => {
    const win = ctx.getWindow()
    const opts = { title, properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle('app:relaunch', () => {
    app.relaunch()
    app.quit()
  })

  handle('app:quit', () => {
    app.quit()
  })

  handle('app:clearCache', async () => {
    const before = await dirSize(ctx.paths.cache)
    await removeDir(ctx.paths.cache)
    await ensureDir(ctx.paths.cache)
    await removeDir(ctx.paths.temp)
    await ensureDir(ctx.paths.temp)
    const win = ctx.getWindow()
    if (win) await win.webContents.session.clearCache()
    return { freedBytes: before }
  })

  handle('app:openLogs', async () => {
    await ensureDir(ctx.paths.logs)
    const err = await shell.openPath(ctx.paths.logs)
    if (err) throw new ShardError('IO', err)
  })

  handle('app:resetLauncher', async () => {
    if (ctx.services.launcher.anyRunning()) {
      throw new ShardError('INSTANCE_RUNNING', 'Close the game before resetting the launcher')
    }
    ctx.settings.reset()
    await removeDir(ctx.paths.cache)
    const win = ctx.getWindow()
    if (win) {
      await win.webContents.session.clearCache()
      await win.webContents.session.clearStorageData()
    }
    app.relaunch()
    app.quit()
  })

  handle('app:copyToClipboard', ({ text }) => {
    clipboard.writeText(text)
  })

  handle('window:minimize', () => ctx.getWindow()?.minimize())
  handle('window:toggleMaximize', () => {
    const win = ctx.getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  handle('window:close', () => ctx.getWindow()?.close())
  handle('window:isMaximized', () => ctx.getWindow()?.isMaximized() ?? false)

  handle('settings:get', () => ctx.settings.get())
  handle('settings:update', (patch) => ctx.settings.update(patch))
  handle('settings:migrateDataDir', ({ target }) => migrateDataDir(ctx, target))
  handle('settings:previewAccent', () => {
    // Accent preview is purely a renderer concern; this exists so the renderer can confirm
    // persistence without committing. Nothing to do on the main side.
  })

  ctx.settings.onChange((settings) => ctx.emit('settings:changed', settings))
}

export async function statSafe(path: string): Promise<{ size: number } | null> {
  try {
    const s = await stat(path)
    return { size: s.size }
  } catch {
    return null
  }
}
