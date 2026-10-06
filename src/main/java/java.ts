/** JavaService: registry of runtimes, managed installs, validation, and the `java:*` IPC. */
import { readFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { ShardError } from '@shared/errors'
import { JavaRuntimeListSchema } from '@shared/schemas/storage'
import { type DownloadProgress, type Instance, type JavaRuntime } from '@shared/types'
import { type AppContext, type JavaService, type ProgressSink } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { exists, hashBuffer, removeDir, writeJson } from '../util/fs'
import { installAdoptiumRuntime, installMojangRuntime, locateJavaExecutable, type InstalledRuntime } from './install'
import { mojangPlatformKey } from './platform'
import { validateJava } from './probe'

const log = createLogger('java')

function loadRegistry(file: string): JavaRuntime[] {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  try {
    const parsed = JavaRuntimeListSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
    log.warn('runtimes.json failed validation; starting with an empty registry', parsed.error.issues.slice(0, 3))
  } catch (err) {
    log.warn('runtimes.json is not valid JSON; starting with an empty registry', err)
  }
  return []
}

function isManaged(runtime: JavaRuntime): boolean {
  return runtime.source === 'mojang' || runtime.source === 'adoptium'
}

export function createJavaService(ctx: AppContext): JavaService {
  const registry = loadRegistry(ctx.paths.javaRuntimesFile)
  const inFlight = new Map<number, Promise<JavaRuntime>>()

  const persist = (): Promise<void> => writeJson(ctx.paths.javaRuntimesFile, registry)

  async function upsert(runtime: JavaRuntime): Promise<JavaRuntime> {
    const index = registry.findIndex((r) => r.id === runtime.id)
    if (index >= 0) registry[index] = runtime
    else registry.push(runtime)
    await persist()
    return runtime
  }

  async function drop(id: string): Promise<void> {
    const index = registry.findIndex((r) => r.id === id)
    if (index < 0) return
    registry.splice(index, 1)
    await persist()
  }

  /** Top-level folder under `java/` that a managed runtime lives in, or null for anything else. */
  function managedInstallDir(runtime: JavaRuntime): string | null {
    const rel = relative(ctx.paths.java, resolve(runtime.path))
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
    const top = rel.split(/[\\/]/)[0]
    return top ? join(ctx.paths.java, top) : null
  }

  async function finishInstall(installed: InstalledRuntime, major: number): Promise<JavaRuntime> {
    const executable = await locateJavaExecutable(installed.installDir)
    if (!executable) {
      throw new ShardError('JAVA_DOWNLOAD_FAILED', `Downloaded Java ${major} but could not find its executable in ${installed.installDir}`)
    }
    const validation = await validateJava(executable)
    if (!validation.valid) {
      throw new ShardError('JAVA_INVALID', `Downloaded Java ${major} failed validation: ${validation.error ?? 'unknown error'}`)
    }
    const runtime: JavaRuntime = {
      id: `${installed.source}-${basename(installed.installDir)}`,
      major: validation.major ?? major,
      path: executable,
      version: validation.version,
      source: installed.source,
      valid: true,
      component: installed.component
    }
    log.info(`Java ${runtime.major} ready at ${runtime.path} (${runtime.version ?? 'unknown version'})`)
    return upsert(runtime)
  }

  async function install(major: number, sink?: ProgressSink): Promise<JavaRuntime> {
    const settings = ctx.settings.get()
    const options = {
      major,
      javaDir: ctx.paths.java,
      tempDir: ctx.paths.temp,
      concurrency: settings.downloadConcurrency,
      signal: sink?.signal,
      onProgress: (download: DownloadProgress, message: string): void => {
        ctx.emit('java:progress', { major, download, message })
        sink?.onProgress?.(download, message)
      }
    }
    sink?.onMessage?.(`Preparing Java ${major}`)

    const platformKey = mojangPlatformKey(process.platform, process.arch)
    let installed: InstalledRuntime | null = null
    if (platformKey) installed = await installMojangRuntime(options, platformKey)
    if (!installed) {
      log.info(`Mojang has no Java ${major} for ${process.platform}-${process.arch}; using Adoptium`)
      installed = await installAdoptiumRuntime(options)
    }
    return finishInstall(installed, major)
  }

  const service: JavaService = {
    list() {
      return [...registry]
    },

    validate(path) {
      return validateJava(path)
    },

    async ensure(major, sink) {
      const existing = registry.find((r) => isManaged(r) && r.major === major)
      if (existing) {
        if (await exists(existing.path)) {
          if (existing.valid) return existing
          const validation = await validateJava(existing.path)
          if (validation.valid) {
            return upsert({ ...existing, valid: true, version: validation.version, major: validation.major ?? major })
          }
        }
        log.warn(`Managed Java ${major} at ${existing.path} is missing or broken; reinstalling`)
        await drop(existing.id)
      }

      const pending = inFlight.get(major)
      if (pending) return pending
      const task = install(major, sink).finally(() => inFlight.delete(major))
      inFlight.set(major, task)
      return task
    },

    async addCustom(path) {
      const validation = await validateJava(path)
      if (!validation.valid || validation.major === null) {
        throw new ShardError('JAVA_INVALID', `${path} is not a usable Java executable: ${validation.error ?? 'unknown error'}`)
      }
      return upsert({
        id: `custom-${hashBuffer(resolve(path), 'sha1').slice(0, 12)}`,
        major: validation.major,
        path,
        version: validation.version,
        source: 'custom',
        valid: true,
        component: null
      })
    },

    async remove(id) {
      const runtime = registry.find((r) => r.id === id)
      if (!runtime) throw new ShardError('NOT_FOUND', `No Java runtime with id ${id}`)
      if (isManaged(runtime)) {
        const dir = managedInstallDir(runtime)
        if (dir) {
          log.info(`Removing managed runtime ${dir}`)
          await removeDir(dir)
        }
      }
      await drop(id)
    },

    async resolveForInstance(instance: Instance, requiredMajor, sink) {
      const custom = instance.settings.javaPath
      if (!custom) return service.ensure(requiredMajor, sink)

      const validation = await validateJava(custom)
      if (!validation.valid || validation.major === null) {
        throw new ShardError('JAVA_INVALID', `The custom Java for ${instance.name} (${custom}) is not usable: ${validation.error ?? 'unknown error'}`)
      }
      if (validation.major < requiredMajor) {
        throw new ShardError(
          'JAVA_INVALID',
          `Minecraft ${instance.minecraftVersion} needs Java ${requiredMajor} or newer, but the custom Java for ${instance.name} is Java ${validation.major} (${validation.version ?? 'unknown version'}). Pick a newer JDK or clear the custom Java path to use the managed runtime.`
        )
      }
      return {
        id: `custom-${hashBuffer(resolve(custom), 'sha1').slice(0, 12)}`,
        major: validation.major,
        path: custom,
        version: validation.version,
        source: 'custom',
        valid: true,
        component: null
      }
    }
  }

  return service
}

export function registerJavaIpc(ctx: AppContext): void {
  handle('java:list', () => ctx.services.java.list())
  handle('java:validate', ({ path }) => ctx.services.java.validate(path))
  handle('java:ensure', ({ major }) => ctx.services.java.ensure(major))
  handle('java:addCustom', ({ path }) => ctx.services.java.addCustom(path))
  handle('java:remove', ({ id }) => ctx.services.java.remove(id))
}
