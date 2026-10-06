/**
 * Development-only end-to-end smoke harness. Never active in packaged builds.
 *
 *   SHARD_SMOKE_INSTALL=1.21.4|latest   create an instance for that version and run the full
 *                                        prepare pipeline (manifest, Java, client, libraries,
 *                                        assets, mods, Shard jar)
 *   SHARD_SMOKE_TYPE=vanilla|shard       instance type (default vanilla)
 *   SHARD_SMOKE_LAUNCH=1                 additionally launch the game with a placeholder
 *                                        session, wait for the title screen, then kill it
 *   SHARD_SMOKE_RESULT=<path.json>       where to write the result summary
 *
 * The placeholder session is NOT an offline mode: it only exists here, the code path is
 * unreachable when `app.isPackaged`, and it is used purely to confirm the launch pipeline spawns
 * a working game. Multiplayer would reject the token.
 */
import { app } from 'electron'
import { type AccountSummary } from '@shared/types'
import { type AccountService, type AppContext, type GameSession } from './context'
import { createLogger } from './logger'
import { writeJson } from './util/fs'

const log = createLogger('smoke')

const TITLE_MARKERS = {
  window: /Backend library: LWJGL/,
  sound: /Sound engine started/,
  atlas: /Created: \d+x\d+x\d+ minecraft:textures\/atlas/
}

function placeholderSession(): GameSession {
  return {
    accountId: 'smoke',
    username: 'ShardSmoke',
    uuid: '00000000000000000000000000000000',
    accessToken: 'smoke-placeholder-token',
    xuid: '',
    userType: 'msa',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString()
  }
}

function withPlaceholderSession(real: AccountService): AccountService {
  const session = placeholderSession()
  const summary: AccountSummary = {
    id: session.uuid,
    username: session.username,
    xuid: null,
    skinUrl: null,
    skinVariant: 'classic',
    capeUrl: null,
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    expiresAt: session.expiresAt,
    needsReauth: false,
    isActive: true
  }
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'getSession') return async () => session
      if (prop === 'getLastKnownSession') return () => session
      if (prop === 'getActive') return () => summary
      return Reflect.get(target, prop, receiver)
    }
  })
}

export function smokeRequested(): boolean {
  return Boolean(process.env.SHARD_SMOKE_INSTALL)
}

export async function runSmoke(ctx: AppContext): Promise<void> {
  const requested = process.env.SHARD_SMOKE_INSTALL
  if (!requested) return
  if (ctx.isPackaged) {
    log.warn('Smoke tasks are only available in development builds')
    return
  }
  const type = process.env.SHARD_SMOKE_TYPE === 'shard' ? 'shard' : 'vanilla'
  const launch = process.env.SHARD_SMOKE_LAUNCH === '1'
  const resultPath = process.env.SHARD_SMOKE_RESULT
  const started = Date.now()
  const result: Record<string, unknown> = { requested, type, launch }

  try {
    const list = await ctx.services.versions.list({ includeSnapshots: false, refresh: true })
    const version = requested === 'latest' ? list.latestRelease : requested
    if (!version) throw new Error('No release found')
    result.version = version
    log.info(`Smoke: installing ${type} ${version}`)

    const instance = await ctx.services.instances.create({
      name: ctx.services.instances.uniqueName(`Smoke ${type} ${version}`),
      minecraftVersion: version,
      type
    })
    result.instanceId = instance.id

    const ticker = setInterval(() => {
      const s = ctx.services.launcher.getState(instance.id)
      const active = s.steps.find((st) => st.status === 'active')
      const dl = s.download
      log.info(
        `Smoke: ${s.phase} ${active?.label ?? ''} ${active?.detail ?? ''} ${
          dl && dl.totalBytes ? `${Math.round((dl.doneBytes / dl.totalBytes) * 100)}% ${dl.doneFiles}/${dl.totalFiles} files` : ''
        }`
      )
    }, 2000)

    await ctx.services.launcher.prepare(instance.id)
    clearInterval(ticker)
    const prepared = ctx.services.launcher.getState(instance.id)
    result.prepare = {
      phase: prepared.phase,
      message: prepared.message,
      error: prepared.error,
      steps: prepared.steps.map((s) => `${s.id}:${s.status}`)
    }
    result.prepareMs = Date.now() - started
    log.info(`Smoke: prepare finished with phase=${prepared.phase} in ${result.prepareMs}ms`)

    if (launch && prepared.phase !== 'failed') {
      ctx.services.accounts = withPlaceholderSession(ctx.services.accounts)
      const launchStart = Date.now()
      await ctx.services.launcher.start(instance.id)
      const seen = { window: false, sound: false, atlas: false }
      const deadline = Date.now() + 240_000
      let lastId = 0
      let atlasSeenAt = 0
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const lines = ctx.services.launcher.getConsole(instance.id, lastId)
        for (const line of lines) {
          lastId = line.id
          if (TITLE_MARKERS.window.test(line.text)) seen.window = true
          if (TITLE_MARKERS.sound.test(line.text)) seen.sound = true
          if (TITLE_MARKERS.atlas.test(line.text)) {
            seen.atlas = true
            atlasSeenAt = Date.now()
          }
        }
        const state = ctx.services.launcher.getState(instance.id)
        const titleReached = seen.window && seen.sound && seen.atlas && Date.now() - atlasSeenAt > 4000
        if (titleReached || state.phase !== 'running' || Date.now() > deadline) {
          result.launch = {
            phase: state.phase,
            exitCode: state.exitCode,
            crashReportPath: state.crashReportPath,
            error: state.error,
            markers: seen,
            titleReached,
            launchMs: Date.now() - launchStart,
            consoleTail: ctx.services.launcher.getConsole(instance.id).slice(-40).map((l) => l.text)
          }
          log.info(`Smoke: launch result titleReached=${titleReached} phase=${state.phase}`)
          if (state.phase === 'running') await ctx.services.launcher.kill(instance.id)
          break
        }
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? { message: err.message, stack: err.stack } : String(err)
    log.error('Smoke failed', err)
  }

  if (process.env.SHARD_SMOKE_KEEP !== '1' && typeof result.instanceId === 'string') {
    try {
      await ctx.services.instances.delete(result.instanceId)
      result.cleanedUp = true
    } catch (err) {
      log.warn('Smoke: could not remove the smoke instance', err)
    }
  }

  result.totalMs = Date.now() - started
  if (resultPath) await writeJson(resultPath, result)
  log.info(`Smoke complete in ${result.totalMs}ms; quitting`)
  setTimeout(() => app.quit(), 500)
}
