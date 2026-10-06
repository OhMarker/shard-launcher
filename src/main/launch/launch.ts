/** LaunchService: install/repair/launch orchestration, the game process, console and crashes. */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { ShardError } from '@shared/errors'
import { type Instance, type LaunchMode } from '@shared/types'
import { type AppContext, type GameSession, type LaunchService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { buildArguments } from '../minecraft/arguments'
import { currentOs, launchFeatures } from '../minecraft/rules'
import { ensureDir, writeFileAtomic } from '../util/fs'
import { InstanceConsole, type FatalInfo } from './console'
import { findCrashReports, readCrashReport } from './crash'
import { runPipeline, type PreparedGame } from './pipeline'
import { exitCodeFrom, isKilledExitCode, runHook, terminate, waitForSpawn, type ProcessEnv } from './process'
import { LaunchStateStore } from './progress'

const log = createLogger('launch')

interface RunningGame {
  instanceId: string
  child: ChildProcess
  pid: number
  startedAt: number
  killRequested: boolean
  /** The main window was hidden for this game and must come back when it exits. */
  hiddenWindow: boolean
  /** Fatal startup error detected in the console (Fabric dependency failures etc.). */
  fatal: FatalInfo | null
  exited: Promise<void>
  resolveExited: () => void
}

interface Preparation {
  controller: AbortController
  promise: Promise<void>
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export function createLaunchService(ctx: AppContext): LaunchService {
  const states = new LaunchStateStore((state) => ctx.emit('launch:progress', state))
  const consoles = new Map<string, InstanceConsole>()
  const running = new Map<string, RunningGame>()
  const preparing = new Map<string, Preparation>()

  function consoleFor(instanceId: string): InstanceConsole {
    let con = consoles.get(instanceId)
    if (!con) {
      con = new InstanceConsole((lines) => ctx.emit('launch:console', { instanceId, lines }))
      consoles.set(instanceId, con)
    }
    return con
  }

  async function patchInstance(instanceId: string, patch: Partial<Instance>): Promise<Instance> {
    const instances = ctx.services.instances
    return instances.save({ ...instances.getRaw(instanceId), ...patch })
  }

  function gameEnv(instance: Instance, folder: string): ProcessEnv {
    return {
      ...process.env,
      SHARD_INSTANCE_ID: instance.id,
      SHARD_INSTANCE_DIR: folder,
      SHARD_MC_VERSION: instance.minecraftVersion
    }
  }

  function assertNotBusy(instanceId: string): void {
    if (running.has(instanceId)) throw new ShardError('INSTANCE_RUNNING', 'This instance is already running')
    if (preparing.has(instanceId)) throw new ShardError('INSTANCE_RUNNING', 'This instance is already being prepared')
  }

  function begin(instanceId: string, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const controller = new AbortController()
    const promise = work(controller.signal).finally(() => preparing.delete(instanceId))
    preparing.set(instanceId, { controller, promise })
    return promise
  }

  /** Marks the pipeline outcome on the state and the console; rethrows for the caller. */
  function failPreparation(instanceId: string, mode: LaunchMode, err: unknown): never {
    const error = ShardError.from(err)
    const con = consoleFor(instanceId)
    if (error.code === 'CANCELLED') {
      states.update(instanceId, { phase: 'idle', message: 'Cancelled', download: null })
      con.launcher('Cancelled')
      throw error
    }
    states.update(instanceId, { phase: 'failed', error: error.toJSON(), message: error.message, download: null })
    con.launcher(`${mode === 'launch' ? 'Launch' : mode === 'repair' ? 'Repair' : 'Install'} failed: [${error.code}] ${error.message}`, 'error')
    if (error.code === 'INSTANCE_BROKEN') {
      patchInstance(instanceId, { installState: 'broken' }).catch((e: unknown) => log.warn('Could not mark instance broken', e))
    }
    throw error
  }

  async function resolveSession(instance: Instance): Promise<GameSession> {
    const accounts = ctx.services.accounts
    if (!accounts.getActive()) throw new ShardError('ACCOUNT_REQUIRED', 'Sign in with a Microsoft account to launch Minecraft')
    try {
      return await accounts.getSession()
    } catch (err) {
      const error = ShardError.from(err)
      const offlineLike = error.code === 'OFFLINE' || error.code === 'TIMEOUT' || error.code === 'AUTH_REFRESH_FAILED'
      if (offlineLike && instance.installState === 'installed') {
        const last = accounts.getLastKnownSession()
        if (last) {
          consoleFor(instance.id).launcher('Offline: using last known session', 'warn')
          return last
        }
      }
      throw error
    }
  }

  async function runPrepare(instance: Instance, mode: 'install' | 'repair', signal: AbortSignal): Promise<void> {
    const con = consoleFor(instance.id)
    states.begin(instance.id, mode)
    con.launcher(`${mode === 'repair' ? 'Repairing' : 'Installing'} ${instance.name} (Minecraft ${instance.minecraftVersion})`)
    try {
      await runPipeline({ ctx, instance, mode, signal, session: null, states, console: con })
      await patchInstance(instance.id, { installState: 'installed' })
      states.setStep(instance.id, 'spawn', 'skipped', { detail: 'Not launched' })
      states.update(instance.id, { phase: 'idle', message: 'Ready', download: null })
      con.launcher('Ready')
    } catch (err) {
      failPreparation(instance.id, mode, err)
    }
  }

  async function runLaunch(instance: Instance, signal: AbortSignal): Promise<void> {
    const con = consoleFor(instance.id)
    states.begin(instance.id, 'launch')
    con.launcher(`Launching ${instance.name} (Minecraft ${instance.minecraftVersion})`)
    try {
      const session = await resolveSession(instance)
      const prepared = await runPipeline({ ctx, instance, mode: 'launch', signal, session, states, console: con })
      prepared.instance = await patchInstance(instance.id, { installState: 'installed' })
      await spawnGame(prepared, session)
    } catch (err) {
      failPreparation(instance.id, 'launch', err)
    }
  }

  async function spawnGame(prepared: PreparedGame, session: GameSession): Promise<void> {
    const instance = prepared.instance
    const instanceId = instance.id
    const con = consoleFor(instanceId)
    const settings = ctx.settings.get()
    const folder = ctx.services.instances.folder(instanceId)
    const env = gameEnv(instance, folder)

    states.setStep(instanceId, 'spawn', 'active', { message: 'Starting Minecraft' })
    try {
      const hook = instance.settings.preLaunchHook.trim()
      if (hook) {
        con.launcher(`Running pre-launch hook: ${hook}`)
        const code = await runHook(hook, { cwd: folder, env, onLine: (text, level) => con.launcher(`[pre-launch] ${text}`, level) })
        if (code !== 0) throw new ShardError('LAUNCH_FAILED', `The pre-launch hook exited with code ${code}`)
      }

      const os = currentOs()
      const args = buildArguments(prepared.resolved, {
        os,
        features: launchFeatures({ fullscreen: instance.settings.fullscreen }),
        session: { username: session.username, uuid: session.uuid, accessToken: session.accessToken, xuid: session.xuid },
        versionName: prepared.resolved.id,
        versionType: prepared.resolved.type,
        gameDirectory: folder,
        assetsRoot: ctx.paths.assets,
        assetsIndexName: prepared.resolved.assetIndex?.id ?? prepared.resolved.assets ?? 'legacy',
        nativesDirectory: prepared.nativesDir,
        libraryDirectory: ctx.paths.libraries,
        launcherVersion: ctx.version,
        classpath: prepared.classpath,
        memoryMb: instance.settings.memoryMb,
        jvmArgs: [...settings.java.jvmArgs, ...instance.settings.jvmArgs],
        gameArgs: instance.settings.gameArgs,
        width: instance.settings.width,
        height: instance.settings.height,
        fullscreen: instance.settings.fullscreen
      })

      con.launcher(`Java: ${prepared.java.path}`)
      con.launcher(`Main class: ${args.mainClass}`)
      con.launcher(`JVM arguments: ${args.jvm.filter((a) => !a.includes(ctx.paths.libraries)).join(' ')}`)
      con.launcher(`Memory: ${instance.settings.memoryMb} MB`)

      const child = spawn(prepared.java.path, [...args.jvm, args.mainClass, ...args.game], {
        cwd: folder,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      await waitForSpawn(child)
      const pid = child.pid ?? 0
      attach(instance, child, pid, folder, env)
    } catch (err) {
      const error = ShardError.from(err, 'LAUNCH_FAILED')
      states.setStep(instanceId, 'spawn', 'failed', { detail: error.message })
      throw error
    }
  }

  function attach(instance: Instance, child: ChildProcess, pid: number, folder: string, env: ProcessEnv): void {
    const instanceId = instance.id
    const con = consoleFor(instanceId)
    const startedAt = Date.now()
    let resolveExited = (): void => {}
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve
    })
    const run: RunningGame = {
      instanceId,
      child,
      pid,
      startedAt,
      killRequested: false,
      hiddenWindow: false,
      fatal: null,
      exited,
      resolveExited
    }
    running.set(instanceId, run)
    con.resetCrashMarker()
    con.onFatal((info) => {
      if (running.get(instanceId) !== run) return
      run.fatal = info
      con.launcher(`Fatal startup error: ${info.summary}. Stopping Minecraft.`, 'error')
      log.warn(`${instance.name}: fatal startup error (${info.summary}); terminating`)
      terminate(run.child, run.pid, run.exited).catch((err: unknown) => log.error('Terminate after fatal error failed', err))
    })

    child.stdout?.on('data', (chunk: Buffer) => con.pushChunk('stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => con.pushChunk('stderr', chunk))
    child.on('error', (err) => {
      con.launcher(`Process error: ${err.message}`, 'error')
      log.error(`Game process error for ${instance.name}`, err)
    })
    child.on('exit', (code, signal) => {
      onExit(run, instance, folder, env, code, signal).catch((err: unknown) => log.error('Exit handling failed', err))
    })

    const startedIso = new Date(startedAt).toISOString()
    states.setStep(instanceId, 'spawn', 'done', { detail: `PID ${pid}` })
    states.update(instanceId, { phase: 'running', pid, startedAt: startedIso, message: 'Running', download: null, error: null })
    con.launcher(`Minecraft started (PID ${pid})`)
    log.info(`Launched ${instance.name} (PID ${pid})`)

    patchInstance(instanceId, { lastPlayedAt: startedIso }).catch((err: unknown) => log.warn('Could not record lastPlayedAt', err))

    const win = ctx.getWindow()
    if (win) {
      const behavior = ctx.settings.get().launchBehavior
      if (behavior === 'minimize') win.minimize()
      else if (behavior === 'close') {
        win.hide()
        run.hiddenWindow = true
      }
    }

    ctx.services.discord.setActivity({
      details: `Playing Minecraft ${instance.minecraftVersion}`,
      state: instance.type === 'shard' ? 'Shard client' : 'Vanilla',
      startTimestamp: startedAt,
      largeImageKey: 'shard'
    })
  }

  async function onExit(
    run: RunningGame,
    instance: Instance,
    folder: string,
    env: ProcessEnv,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    const instanceId = run.instanceId
    const con = consoleFor(instanceId)
    running.delete(instanceId)
    con.flushRemainder()

    const exitCode = exitCodeFrom(code, signal)
    const reports = await findCrashReports(join(folder, 'crash-reports'), run.startedAt)
    const newest = reports[0] ?? null
    const fatal = run.fatal
    const killed = !fatal && (run.killRequested || isKilledExitCode(exitCode))
    const crashed = !killed && (fatal !== null || (exitCode !== null && exitCode !== 0) || newest !== null || con.sawCrashMarker)

    con.launcher(
      fatal
        ? `Minecraft could not start: ${fatal.summary}`
        : crashed
          ? `Minecraft crashed (exit code ${exitCode ?? 'unknown'})`
          : `Minecraft exited (code ${exitCode ?? 'unknown'})`,
      crashed ? 'error' : 'info'
    )
    con.flush()
    states.update(instanceId, {
      phase: crashed ? 'crashed' : 'exited',
      exitCode,
      crashReportPath: newest?.path ?? null,
      pid: null,
      message: crashed ? 'Crashed' : 'Exited'
    })
    log.info(`${instance.name} exited with code ${exitCode ?? 'null'}${crashed ? ' (crash)' : ''}`)

    if (crashed) {
      let summary = fatal
        ? [fatal.summary, fatal.details[0]].filter(Boolean).join(': ')
        : `Exit code ${exitCode ?? 'unknown'}`
      if (newest) {
        try {
          summary = (await readCrashReport(newest.path)).summary
        } catch (err) {
          log.warn(`Could not read crash report ${newest.path}`, err)
        }
      }
      ctx.emit('app:toast', { kind: 'error', title: 'Minecraft crashed', message: summary })
    }

    ctx.services.discord.clear()
    if (run.hiddenWindow) {
      const win = ctx.getWindow()
      if (win) {
        win.show()
        win.focus()
      }
    }

    let current = instance
    try {
      const fresh = ctx.services.instances.getRaw(instanceId)
      current = await ctx.services.instances.save({ ...fresh, playtimeMs: fresh.playtimeMs + (Date.now() - run.startedAt) })
    } catch (err) {
      log.warn('Could not record playtime', err)
    }

    if (ctx.settings.get().sharedConfig && current.settings.sharedConfig) {
      try {
        await ctx.services.sharedConfig.syncOut(current)
      } catch (err) {
        log.warn('Shared config sync-out failed', err)
      }
    }

    const hook = current.settings.postExitHook.trim()
    if (hook) {
      con.launcher(`Running post-exit hook: ${hook}`)
      runHook(hook, { cwd: folder, env, onLine: (text, level) => con.launcher(`[post-exit] ${text}`, level) })
        .then((hookCode) => con.launcher(`Post-exit hook finished with code ${hookCode}`, hookCode === 0 ? 'info' : 'warn'))
        .catch((err: unknown) => con.launcher(`Post-exit hook failed: ${err instanceof Error ? err.message : String(err)}`, 'warn'))
    }

    run.resolveExited()
  }

  const service: LaunchService = {
    async start(instanceId) {
      assertNotBusy(instanceId)
      const instance = ctx.services.instances.getRaw(instanceId)
      return begin(instanceId, (signal) => runLaunch(instance, signal))
    },

    async prepare(instanceId, opts) {
      if (running.has(instanceId)) throw new ShardError('INSTANCE_RUNNING', 'Stop the game before preparing this instance')
      const existing = preparing.get(instanceId)
      if (existing) return existing.promise
      const instance = ctx.services.instances.getRaw(instanceId)
      const mode = opts?.repair ? 'repair' : 'install'
      return begin(instanceId, (signal) => runPrepare(instance, mode, signal))
    },

    cancelPrepare(instanceId) {
      preparing.get(instanceId)?.controller.abort()
    },

    async kill(instanceId) {
      const run = running.get(instanceId)
      if (!run) return
      run.killRequested = true
      consoleFor(instanceId).launcher('Stopping Minecraft', 'warn')
      await terminate(run.child, run.pid, run.exited)
    },

    getState(instanceId) {
      return states.get(instanceId)
    },

    getAll() {
      return states.all()
    },

    getConsole(instanceId, after) {
      return consoleFor(instanceId).get(after ?? 0)
    },

    clearConsole(instanceId) {
      consoleFor(instanceId).clear()
    },

    async exportConsole(instanceId) {
      const con = consoles.get(instanceId)
      if (!con || con.size === 0) return null
      const dir = join(ctx.services.instances.folder(instanceId), 'logs')
      await ensureDir(dir)
      const path = join(dir, `shard-console-${timestampForFile()}.log`)
      await writeFileAtomic(path, `${con.toText()}\n`)
      return path
    },

    async getCrashReport(instanceId) {
      const state = states.get(instanceId)
      const instance = ctx.services.instances.getRaw(instanceId)
      const sinceIso = state.startedAt ?? instance.lastPlayedAt
      if (!sinceIso) return null
      const reports = await findCrashReports(join(ctx.services.instances.folder(instanceId), 'crash-reports'), Date.parse(sinceIso))
      const newest = reports[0]
      return newest ? readCrashReport(newest.path) : null
    },

    isRunning(instanceId) {
      return running.has(instanceId)
    },

    anyRunning() {
      return running.size > 0
    },

    async killAll() {
      await Promise.all([...running.keys()].map((id) => service.kill(id)))
    }
  }

  return service
}

export function registerLaunchIpc(ctx: AppContext): void {
  const launcher = (): LaunchService => ctx.services.launcher

  handle('launch:start', ({ instanceId }) => launcher().start(instanceId))
  handle('launch:kill', ({ instanceId }) => launcher().kill(instanceId))
  handle('launch:getState', ({ instanceId }) => launcher().getState(instanceId))
  handle('launch:getAll', () => launcher().getAll())
  handle('launch:getConsole', ({ instanceId, after }) => launcher().getConsole(instanceId, after))
  handle('launch:clearConsole', ({ instanceId }) => launcher().clearConsole(instanceId))
  handle('launch:exportConsole', ({ instanceId }) => launcher().exportConsole(instanceId))
  handle('launch:getCrashReport', ({ instanceId }) => launcher().getCrashReport(instanceId))
}
