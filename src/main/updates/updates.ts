import { shell } from 'electron'
import electronUpdater from 'electron-updater'
import { GITHUB_OWNER, GITHUB_REPO, URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { compareLooseSemver } from '@shared/minecraft-version'
import { GitHubReleaseListSchema } from '@shared/schemas/misc'
import { type LauncherUpdateState, type UpdateChannel } from '@shared/types'
import { type AppContext, type UpdateService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { JsonCache } from '../util/json-cache'
import { mapReleaseNotes, releaseNotesText } from './release-notes'

// electron-updater is CommonJS; the ESM main bundle gets its exports through the default import.
const { autoUpdater } = electronUpdater

const log = createLogger('updates')

const FIRST_CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60_000
/** GitHub allows 60 anonymous requests per hour; the ETag revalidation after this still counts. */
const RELEASES_MAX_AGE_MS = 30 * 60_000
const UNSUPPORTED_NOTE = 'Launcher updates are only available in the installed build, not when running from source.'
const PORTABLE_NOTE =
  'This is the portable build, which cannot update itself. Download the new version and replace your Shard Launcher.exe.'
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

/** electron-builder's portable target sets this when the single-file exe is running. */
const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

export function createUpdateService(ctx: AppContext): UpdateService {
  /** electron-updater only works for installed (NSIS/DMG/AppImage) builds. */
  const canSelfUpdate = ctx.isPackaged && !isPortable
  let state: LauncherUpdateState = {
    currentVersion: ctx.version,
    channel: ctx.settings.get().updateChannel,
    status: ctx.isPackaged ? 'idle' : 'unsupported',
    availableVersion: null,
    releaseNotes: null,
    progress: null,
    error: ctx.isPackaged ? null : UNSUPPORTED_NOTE,
    lastCheckedAt: null
  }

  /** Portable builds compare against GitHub Releases and point the user at the download. */
  async function checkPortable(): Promise<void> {
    const notes = await service.releaseNotes()
    const beta = ctx.settings.get().updateChannel === 'beta'
    const newest = notes.find((n) => beta || !n.prerelease)
    const version = newest?.tag.replace(/^v/, '')
    if (version && compareLooseSemver(version, ctx.version) > 0) {
      patch({
        status: 'available',
        availableVersion: version,
        releaseNotes: newest?.body ?? null,
        error: PORTABLE_NOTE,
        lastCheckedAt: now()
      })
    } else {
      patch({ status: 'up-to-date', availableVersion: null, releaseNotes: null, error: null, lastCheckedAt: now() })
    }
  }
  let initialized = false
  let checking: Promise<void> | null = null
  let releasesFailureLogged = false

  const now = (): string => new Date().toISOString()

  function patch(changes: Partial<LauncherUpdateState>): void {
    state = { ...state, ...changes }
    ctx.emit('updates:state', state)
  }

  function applyChannel(channel: UpdateChannel): void {
    autoUpdater.allowPrerelease = channel === 'beta'
    autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest'
  }

  function wireAutoUpdater(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = createLogger('electron-updater')
    applyChannel(state.channel)

    autoUpdater.on('checking-for-update', () => patch({ status: 'checking', error: null }))
    autoUpdater.on('update-available', (info) =>
      patch({
        status: 'available',
        availableVersion: info.version,
        releaseNotes: releaseNotesText(info.releaseNotes),
        progress: null,
        error: null
      })
    )
    autoUpdater.on('update-not-available', () =>
      patch({ status: 'up-to-date', availableVersion: null, releaseNotes: null, progress: null, error: null })
    )
    autoUpdater.on('download-progress', (info) =>
      patch({
        status: 'downloading',
        progress: {
          percent: info.percent,
          bytesPerSecond: info.bytesPerSecond,
          transferred: info.transferred,
          total: info.total
        }
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      patch({
        status: 'downloaded',
        availableVersion: info.version,
        releaseNotes: releaseNotesText(info.releaseNotes) ?? state.releaseNotes,
        progress: null,
        error: null
      })
    )
    autoUpdater.on('error', (err) => {
      log.warn(`electron-updater error: ${err.message}`)
      patch({ status: 'error', error: err.message, progress: null })
    })
  }

  async function check(): Promise<LauncherUpdateState> {
    if (!ctx.isPackaged) return state
    if (checking) {
      await checking
      return state
    }
    if (state.status === 'downloading' || state.status === 'downloaded') return state
    checking = (async () => {
      try {
        if (isPortable) {
          patch({ status: 'checking', error: null })
          await checkPortable()
          return
        }
        const result = await autoUpdater.checkForUpdates()
        // null means electron-updater refused to run (not packaged / no publish config).
        if (result === null) patch({ status: 'unsupported', error: UNSUPPORTED_NOTE, lastCheckedAt: now() })
        else patch({ lastCheckedAt: now() })
      } catch (err) {
        const error = ShardError.from(err, 'UPDATE_FAILED')
        log.warn(`Update check failed: ${error.message}`)
        patch({ status: 'error', error: error.message, progress: null, lastCheckedAt: now() })
      } finally {
        checking = null
      }
    })()
    await checking
    return state
  }

  const service: UpdateService = {
    init() {
      if (initialized) return
      initialized = true
      ctx.settings.onChange((next, previous) => {
        if (next.updateChannel === previous.updateChannel) return
        patch({ channel: next.updateChannel })
        if (!ctx.isPackaged) return
        if (canSelfUpdate) applyChannel(next.updateChannel)
        void check()
      })
      if (!ctx.isPackaged) {
        log.info('Running unpackaged; launcher self-update is disabled')
        return
      }
      if (canSelfUpdate) wireAutoUpdater()
      else log.info('Portable build; update checks compare against GitHub Releases without self-installing')
      setTimeout(() => void check(), FIRST_CHECK_DELAY_MS).unref()
      setInterval(() => void check(), CHECK_INTERVAL_MS).unref()
    },

    getState: () => state,

    check,

    async download() {
      if (!ctx.isPackaged) throw new ShardError('UPDATE_FAILED', UNSUPPORTED_NOTE)
      if (state.status !== 'available') {
        throw new ShardError('INVALID_INPUT', 'No launcher update is available to download')
      }
      if (isPortable) {
        // No in-place update for the single-file exe: send the user to the download page.
        await shell.openExternal(RELEASES_PAGE)
        return
      }
      patch({
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
        error: null
      })
      try {
        await autoUpdater.downloadUpdate()
      } catch (err) {
        const error = ShardError.from(err, 'UPDATE_FAILED')
        patch({ status: 'error', error: error.message, progress: null })
        throw new ShardError('UPDATE_FAILED', `Could not download the update: ${error.message}`, { cause: err })
      }
    },

    install() {
      if (isPortable) {
        void shell.openExternal(RELEASES_PAGE)
        return
      }
      if (state.status !== 'downloaded') {
        throw new ShardError('INVALID_INPUT', 'The launcher update has not finished downloading')
      }
      log.info(`Installing launcher ${state.availableVersion ?? 'update'} and restarting`)
      autoUpdater.quitAndInstall(false, true)
    },

    async releaseNotes() {
      const url = `${URLS.githubApi}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`
      try {
        const result = await new JsonCache(ctx.paths.cache).fetch(url, GitHubReleaseListSchema, {
          maxAgeMs: RELEASES_MAX_AGE_MS,
          headers: { Accept: 'application/vnd.github+json' }
        })
        return mapReleaseNotes(result.data)
      } catch (err) {
        const error = ShardError.from(err)
        if (!releasesFailureLogged) {
          releasesFailureLogged = true
          log.info(`Release notes unavailable (${error.code}: ${error.message})`)
        }
        return []
      }
    },

    markSeen() {
      ctx.settings.update({ lastSeenVersion: ctx.version })
    }
  }
  return service
}

export function registerUpdateIpc(ctx: AppContext): void {
  handle('updates:getState', () => ctx.services.updates.getState())
  handle('updates:check', () => ctx.services.updates.check())
  handle('updates:download', () => ctx.services.updates.download())
  handle('updates:install', () => ctx.services.updates.install())
  handle('updates:releaseNotes', () => ctx.services.updates.releaseNotes())
  handle('updates:markSeen', () => ctx.services.updates.markSeen())
}
