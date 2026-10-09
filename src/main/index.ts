import { firstSet } from '@shared/format'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu, nativeImage, type NativeImage, Tray } from 'electron'
import { APP_NAME, GITHUB_OWNER, GITHUB_REPO, MSA, URLS } from '@shared/constants'
import { type AppContext, type Services } from './context'
import { registerCoreIpc } from './ipc/core-handlers'
import { emit } from './ipc/router'
import { createLogger, initLogging } from './logger'
import { setDefaultUserAgent } from './net/http'
import { defaultDataDir, resolvePaths } from './paths'
import { createServices, type ServiceBundle } from './services'
import { runSmoke, smokeRequested } from './smoke'
import { SettingsStore } from './store/settings'
import { ensureDir } from './util/fs'
import { createMainWindow } from './window'

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'
/** SHARD_DATA_DIR turns the launcher portable: settings, accounts, logs and data all live there. */
const configDir = process.env.SHARD_DATA_DIR?.trim() || defaultDataDir()

// Keep Chromium's profile (cache, cookies for the sign-in window) inside the Shard folder
// instead of the default %APPDATA%/shard-launcher. Must run before `ready`.
app.setPath('userData', join(configDir, 'electron-data'))
app.setPath('sessionData', join(configDir, 'electron-data'))
app.setName(APP_NAME)

// Headless smoke renders (CI) must not depend on a GPU: xvfb has none, and capturePage then
// fails with UnknownVizError when the compositor cannot allocate a GPU surface.
if (process.env.SHARD_SMOKE_SCREENSHOT) app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void bootstrap()
}

/** capturePage can fail transiently (UnknownVizError) right after the first paint; retry briefly. */
async function captureWithRetry(win: BrowserWindow, attempts: number): Promise<NativeImage> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await win.webContents.capturePage()
    } catch (err) {
      lastError = err
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw lastError
}

async function bootstrap(): Promise<void> {
  await ensureDir(join(configDir, 'logs'))
  initLogging(join(configDir, 'logs'), isDev)
  const log = createLogger('main')
  log.info(`${APP_NAME} ${app.getVersion()} starting (electron ${process.versions.electron}, ${process.platform}-${process.arch})`)

  const settings = new SettingsStore(configDir)
  const paths = resolvePaths(configDir, settings.get().dataDir ?? configDir)
  await Promise.all([
    ensureDir(paths.dataDir),
    ensureDir(paths.instances),
    ensureDir(paths.libraries),
    ensureDir(paths.assets),
    ensureDir(paths.versions),
    ensureDir(paths.java),
    ensureDir(paths.cache),
    ensureDir(paths.temp),
    ensureDir(paths.skins),
    ensureDir(paths.sharedConfig),
    ensureDir(paths.cosmetics)
  ])

  const version = app.getVersion()
  setDefaultUserAgent(`${APP_NAME.replace(/\s+/g, '')}/${version} (+https://github.com/${GITHUB_OWNER}/${GITHUB_REPO})`)

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let quitting = false

  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources')
    : join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'resources')

  const ctx: AppContext = {
    paths,
    settings,
    version,
    isDev,
    isPackaged: app.isPackaged,
    resourcesDir,
    getWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
    emit,
    services: {} as Services,
    msaClientId: () => {
      const fromSettings = settings.get().msaClientId?.trim()
      if (fromSettings) return fromSettings
      const fromEnv = process.env.MSA_CLIENT_ID?.trim() || import.meta.env.MSA_CLIENT_ID?.trim()
      return fromEnv ? fromEnv : null
    },
    msaRedirectUri: () =>
      process.env.MSA_REDIRECT_URI?.trim() || import.meta.env.MSA_REDIRECT_URI?.trim() || MSA.redirectUri,
    manifestUrls: () => {
      const s = settings.get().manifestUrls
      // firstSet, not ??: release builds bake unset CI variables in as "" (that was "Invalid URL").
      return {
        shard: firstSet(s.shard, process.env.SHARD_MANIFEST_URL, import.meta.env.SHARD_MANIFEST_URL) ?? URLS.shardManifest,
        bundledMods:
          firstSet(s.bundledMods, process.env.SHARD_BUNDLED_MODS_URL, import.meta.env.SHARD_BUNDLED_MODS_URL) ?? URLS.bundledMods,
        cosmetics: firstSet(s.cosmetics, process.env.SHARD_COSMETICS_URL, import.meta.env.SHARD_COSMETICS_URL) ?? URLS.cosmetics,
        services: firstSet(s.services, process.env.SHARD_SERVICES_URL, import.meta.env.SHARD_SERVICES_URL) ?? URLS.services
      }
    },
    modrinthUserAgent: () => {
      const contact =
        process.env.MODRINTH_CONTACT?.trim() ||
        import.meta.env.MODRINTH_CONTACT?.trim() ||
        `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
      return `${GITHUB_OWNER}/shard-launcher/${version} (${contact})`
    }
  }

  let bundle: ServiceBundle | null = null
  try {
    bundle = await createServices(ctx)
    registerCoreIpc(ctx)
    bundle.registerIpc()
  } catch (err) {
    log.error('Service bootstrap failed', err)
    registerCoreIpc(ctx)
  }

  await app.whenReady()

  const createWindow = (): void => {
    mainWindow = createMainWindow(settings, isDev)
    mainWindow.on('close', (event) => {
      // A running Shard game talks to the launcher (in-game account switching), so while a game
      // runs, closing the window keeps the launcher in the tray instead of quitting.
      const gameRunning = ctx.services.launcher?.anyRunning() ?? false
      if (!quitting && tray && (settings.get().closeToTray || gameRunning)) {
        event.preventDefault()
        mainWindow?.hide()
        if (gameRunning && !settings.get().closeToTray) log.info('Window closed while a game runs; staying in the tray')
      }
    })
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    // Headless smoke test used by CI and local verification: render, capture, quit.
    const smokeShot = process.env.SHARD_SMOKE_SCREENSHOT
    if (smokeShot && mainWindow) {
      const win = mainWindow
      win.webContents.once('did-finish-load', () => {
        const page = process.env.SHARD_SMOKE_PAGE
        if (page) setTimeout(() => emit('app:navigate', { page }), 1200)
        setTimeout(async () => {
          try {
            const image = await captureWithRetry(win, 5)
            const { writeFile } = await import('node:fs/promises')
            await writeFile(smokeShot, image.toPNG())
            log.info(`Smoke screenshot written to ${smokeShot}`)
          } catch (err) {
            log.error('Smoke screenshot failed', err)
          } finally {
            quitting = true
            app.quit()
          }
        }, Number(process.env.SHARD_SMOKE_DELAY_MS ?? 3000))
      })
    }
  }

  const trayIconPath = join(resourcesDir, process.platform === 'win32' ? 'icon.ico' : 'tray.png')
  try {
    const image = nativeImage.createFromPath(trayIconPath)
    if (!image.isEmpty()) {
      tray = new Tray(process.platform === 'darwin' ? image.resize({ width: 18, height: 18 }) : image)
      tray.setToolTip(APP_NAME)
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: `Open ${APP_NAME}`, click: () => showWindow() },
          { type: 'separator' },
          {
            label: 'Quit',
            click: () => {
              quitting = true
              app.quit()
            }
          }
        ])
      )
      tray.on('click', () => showWindow())
    }
  } catch (err) {
    log.warn('Tray unavailable', err)
  }

  const showWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  }

  app.on('second-instance', () => showWindow())
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => {
    const gameRunning = ctx.services.launcher?.anyRunning() ?? false
    if (process.platform !== 'darwin' && !settings.get().closeToTray && !gameRunning) app.quit()
  })
  app.on('will-quit', (event) => {
    if (bundle) {
      event.preventDefault()
      const b = bundle
      bundle = null
      const finish = (): void => app.exit(0)
      const guard = setTimeout(finish, 5000)
      b.dispose()
        .catch((err) => log.error('Dispose failed', err))
        .finally(() => {
          clearTimeout(guard)
          finish()
        })
    }
  })

  createWindow()

  if (bundle) {
    const started = bundle.start().catch((err) => log.error('Startup tasks failed', err))
    if (smokeRequested()) {
      started.then(() => runSmoke(ctx)).catch((err) => log.error('Smoke harness failed', err))
    }
  }
}
