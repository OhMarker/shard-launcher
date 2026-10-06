/** InstanceService: on-disk instance folders with an in-memory registry, plus `instances:*` IPC. */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { totalmem } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { shell } from 'electron'
import { INSTANCE_FILE } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { DEFAULT_INSTANCE_SETTINGS, InstanceSchema, InstanceSettingsSchema } from '@shared/schemas/storage'
import { type Instance, type InstanceSettings, type InstanceSummary } from '@shared/types'
import { type AppContext, type InstanceService } from '../context'
import { handle } from '../ipc/router'
import { createLogger } from '../logger'
import { copyDir, dirSize, ensureDir, exists, removeDir, sanitizeFileName, writeJson } from '../util/fs'

const log = createLogger('instances')

/** Created with every instance so the user (and mods) never hit a missing folder. */
export const INSTANCE_SUBFOLDERS = [
  'mods',
  'config',
  'resourcepacks',
  'shaderpacks',
  'saves',
  'screenshots',
  'logs',
  'crash-reports',
  'natives'
] as const

/** Folders that are machine-local noise and are not copied when duplicating. */
const DUPLICATE_EXCLUDED = new Set<string>(['logs', 'crash-reports', 'natives', INSTANCE_FILE])

const DISK_USAGE_TTL_MS = 30_000
const MIN_DEFAULT_MEMORY_MB = 2048

interface Entry {
  instance: Instance
  folder: string
}

function roundDownTo512(mb: number): number {
  return Math.floor(mb / 512) * 512
}

export function createInstanceService(ctx: AppContext): InstanceService {
  const registry = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  const usageCache = new Map<string, { bytes: number; at: number }>()

  function scan(): void {
    let dirents
    try {
      dirents = readdirSync(ctx.paths.instances, { withFileTypes: true })
    } catch (err) {
      log.warn(`Could not scan ${ctx.paths.instances}`, err)
      return
    }
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue
      const folder = join(ctx.paths.instances, dirent.name)
      const file = join(folder, INSTANCE_FILE)
      let raw: string
      try {
        raw = readFileSync(file, 'utf8')
      } catch {
        log.debug(`Skipping ${dirent.name}: no ${INSTANCE_FILE}`)
        continue
      }
      try {
        const parsed = InstanceSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          log.warn(`Skipping ${dirent.name}: ${INSTANCE_FILE} failed validation`, parsed.error.issues.slice(0, 3))
          continue
        }
        if (registry.has(parsed.data.id)) {
          log.warn(`Skipping ${dirent.name}: duplicate instance id ${parsed.data.id}`)
          continue
        }
        registry.set(parsed.data.id, { instance: parsed.data, folder })
      } catch (err) {
        log.warn(`Skipping ${dirent.name}: ${INSTANCE_FILE} is not valid JSON`, err)
      }
    }
    log.info(`Loaded ${registry.size} instance(s)`)
  }

  scan()

  function getEntry(id: string): Entry {
    const entry = registry.get(id)
    if (!entry) throw new ShardError('NOT_FOUND', `Instance ${id} does not exist`)
    return entry
  }

  function isRunning(id: string): boolean {
    return ctx.services.launcher.isRunning(id)
  }

  function summarize(entry: Entry): InstanceSummary {
    const cached = usageCache.get(entry.instance.id)
    const fresh = cached && Date.now() - cached.at < DISK_USAGE_TTL_MS
    return {
      ...entry.instance,
      folder: entry.folder,
      diskUsageBytes: fresh ? cached.bytes : null,
      running: isRunning(entry.instance.id)
    }
  }

  function summaries(): InstanceSummary[] {
    return [...registry.values()]
      .map(summarize)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  function notify(): void {
    ctx.emit('instances:changed', summaries())
    for (const listener of listeners) {
      try {
        listener()
      } catch (err) {
        log.error('instances listener failed', err)
      }
    }
  }

  function nameTaken(name: string, exceptId?: string): boolean {
    const wanted = name.trim().toLowerCase()
    for (const entry of registry.values()) {
      if (entry.instance.id !== exceptId && entry.instance.name.toLowerCase() === wanted) return true
    }
    return false
  }

  function folderInUse(folder: string): boolean {
    const wanted = resolve(folder).toLowerCase()
    for (const entry of registry.values()) if (resolve(entry.folder).toLowerCase() === wanted) return true
    return false
  }

  /** A folder path for the name that no instance uses and that does not exist on disk yet. */
  async function allocateFolder(name: string): Promise<string> {
    const base = sanitizeFileName(name)
    let candidate = join(ctx.paths.instances, base)
    for (let n = 2; folderInUse(candidate) || (await exists(candidate)); n++) {
      candidate = join(ctx.paths.instances, `${base} (${n})`)
    }
    return candidate
  }

  function defaultSettings(): InstanceSettings {
    const halfOfRam = roundDownTo512(Math.floor(totalmem() / 1024 / 1024 / 2))
    const memoryMb = Math.max(MIN_DEFAULT_MEMORY_MB, Math.min(ctx.settings.get().java.memoryMb, halfOfRam))
    return { ...DEFAULT_INSTANCE_SETTINGS, memoryMb }
  }

  async function persist(instance: Instance, folder: string): Promise<Instance> {
    await writeJson(join(folder, INSTANCE_FILE), instance)
    registry.set(instance.id, { instance, folder })
    notify()
    return instance
  }

  function cleanName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) throw new ShardError('INVALID_INPUT', 'Instance name cannot be empty')
    return trimmed
  }

  const service: InstanceService = {
    async list() {
      return summaries()
    },

    async get(id) {
      return summarize(getEntry(id))
    },

    getRaw(id) {
      return getEntry(id).instance
    },

    all() {
      return [...registry.values()].map((entry) => entry.instance)
    },

    async create({ name, minecraftVersion, type }) {
      const cleaned = cleanName(name)
      if (nameTaken(cleaned)) throw new ShardError('ALREADY_EXISTS', `An instance named "${cleaned}" already exists`)
      const folder = await allocateFolder(cleaned)
      const instance: Instance = {
        id: randomUUID(),
        name: cleaned,
        type,
        minecraftVersion,
        fabricLoader: null,
        shardBuild: null,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        playtimeMs: 0,
        icon: null,
        installState: 'pending',
        settings: defaultSettings()
      }
      await ensureDir(folder)
      await Promise.all(INSTANCE_SUBFOLDERS.map((sub) => ensureDir(join(folder, sub))))
      log.info(`Created instance ${instance.name} (${type}, ${minecraftVersion}) at ${folder}`)
      return persist(instance, folder)
    },

    async update(id, patch) {
      const entry = getEntry(id)
      let instance = entry.instance
      let folder = entry.folder

      if (patch.name !== undefined) {
        const newName = cleanName(patch.name)
        if (newName !== instance.name) {
          if (isRunning(id)) throw new ShardError('INSTANCE_RUNNING', 'Stop the game before renaming this instance')
          if (nameTaken(newName, id)) throw new ShardError('ALREADY_EXISTS', `An instance named "${newName}" already exists`)
          if (sanitizeFileName(newName) !== basename(folder)) {
            const newFolder = await allocateFolder(newName)
            await rename(folder, newFolder)
            registry.set(id, { instance, folder: newFolder })
            folder = newFolder
          }
          instance = { ...instance, name: newName }
        }
      }
      if (patch.icon !== undefined) instance = { ...instance, icon: patch.icon }
      if (patch.settings) {
        const merged = InstanceSettingsSchema.safeParse({ ...instance.settings, ...patch.settings })
        if (!merged.success) {
          throw new ShardError('INVALID_INPUT', 'Invalid instance settings', { details: merged.error.issues })
        }
        instance = { ...instance, settings: merged.data }
      }
      return persist(instance, folder)
    },

    async duplicate(id, name) {
      const source = getEntry(id)
      const cleaned = cleanName(name)
      if (nameTaken(cleaned)) throw new ShardError('ALREADY_EXISTS', `An instance named "${cleaned}" already exists`)
      const folder = await allocateFolder(cleaned)
      await copyDir(source.folder, folder, {
        filter: (rel) => !DUPLICATE_EXCLUDED.has(rel.split(/[\\/]/)[0] ?? '')
      })
      await Promise.all(INSTANCE_SUBFOLDERS.map((sub) => ensureDir(join(folder, sub))))
      const instance: Instance = {
        ...source.instance,
        id: randomUUID(),
        name: cleaned,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        playtimeMs: 0
      }
      log.info(`Duplicated ${source.instance.name} as ${cleaned}`)
      return persist(instance, folder)
    },

    async delete(id) {
      const entry = getEntry(id)
      if (isRunning(id)) throw new ShardError('INSTANCE_RUNNING', 'Stop the game before deleting this instance')
      await removeDir(entry.folder)
      registry.delete(id)
      usageCache.delete(id)
      log.info(`Deleted instance ${entry.instance.name}`)
      notify()
    },

    folder(id) {
      return getEntry(id).folder
    },

    async diskUsage(id) {
      const entry = getEntry(id)
      const cached = usageCache.get(id)
      if (cached && Date.now() - cached.at < DISK_USAGE_TTL_MS) return cached.bytes
      const bytes = await dirSize(entry.folder)
      usageCache.set(id, { bytes, at: Date.now() })
      return bytes
    },

    async save(instance) {
      const entry = getEntry(instance.id)
      const parsed = InstanceSchema.safeParse(instance)
      if (!parsed.success) {
        throw new ShardError('INVALID_INPUT', 'Invalid instance record', { details: parsed.error.issues })
      }
      return persist(parsed.data, entry.folder)
    },

    uniqueName(base) {
      const trimmed = base.trim() || 'Instance'
      if (!nameTaken(trimmed)) return trimmed
      for (let n = 2; ; n++) {
        const candidate = `${trimmed} (${n})`
        if (!nameTaken(candidate)) return candidate
      }
    },

    onChanged(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }

  return service
}

export function registerInstanceIpc(ctx: AppContext): void {
  const instances = (): InstanceService => ctx.services.instances

  handle('instances:list', () => instances().list())
  handle('instances:get', ({ id }) => instances().get(id))
  handle('instances:create', (input) => instances().create(input))
  handle('instances:update', ({ id, patch }) => instances().update(id, patch))
  handle('instances:duplicate', ({ id, name }) => instances().duplicate(id, name))
  handle('instances:delete', ({ id }) => instances().delete(id))
  handle('instances:diskUsage', ({ id }) => instances().diskUsage(id))
  handle('instances:prepare', ({ id, repair }) => ctx.services.launcher.prepare(id, { repair: repair ?? false }))
  handle('instances:cancelPrepare', ({ id }) => ctx.services.launcher.cancelPrepare(id))

  handle('instances:openFolder', async ({ id, sub }) => {
    const folder = instances().folder(id)
    const target = sub ? resolve(folder, sub) : folder
    const rel = relative(folder, target)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new ShardError('INVALID_INPUT', 'Folder must be inside the instance')
    }
    await ensureDir(target)
    const error = await shell.openPath(target)
    if (error) throw new ShardError('IO', error)
  })
}
