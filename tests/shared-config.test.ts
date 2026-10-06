import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INSTANCE_SETTINGS } from '@shared/schemas/storage'
import { type BundledModsManifest, type Instance } from '@shared/types'
import { type AppContext } from '@main/context'
import {
  collectSharedFiles,
  isSharedConfigEnabled,
  MTIME_TOLERANCE_MS,
  planSync,
  safeRelativePath,
  type SyncEntry
} from '@main/shard/shared-config-plan'
import { createSharedConfigService } from '@main/shard/shared-config'

vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const manifest: BundledModsManifest = {
  schemaVersion: 1,
  updatedAt: '2026-10-06T00:00:00Z',
  mods: [
    { slug: 'fabric-api', name: 'Fabric API', required: true, locked: true, description: '', configFiles: [] },
    {
      slug: 'sodium',
      name: 'Sodium',
      required: false,
      locked: true,
      description: '',
      configFiles: ['config/sodium-options.json', 'config\\sodium-mixins.properties']
    },
    { slug: 'evil', name: 'Evil', required: false, locked: true, description: '', configFiles: ['../settings.json', '/etc/passwd'] }
  ],
  sharedFiles: ['options.txt', 'config/sodium-options.json', 'C:\\Windows\\win.ini', ''],
  conflicts: []
}

describe('collectSharedFiles', () => {
  it('merges mod config files with shared files, normalises slashes and deduplicates', () => {
    const { files } = collectSharedFiles(manifest)
    expect(files).toEqual(['config/sodium-options.json', 'config/sodium-mixins.properties', 'options.txt'])
  })

  it('rejects entries that could escape the instance folder', () => {
    const { rejected } = collectSharedFiles(manifest)
    expect(rejected).toEqual(['../settings.json', '/etc/passwd', 'C:\\Windows\\win.ini', ''])
    expect(safeRelativePath('config/./x.json')).toBeNull()
    expect(safeRelativePath('config//x.json')).toBeNull()
    expect(safeRelativePath(' options.txt ')).toBe('options.txt')
  })
})

describe('planSync', () => {
  const entry = (rel: string, sharedMtimeMs: number | null, instanceMtimeMs: number | null): SyncEntry => ({
    rel,
    sharedMtimeMs,
    instanceMtimeMs
  })
  const t = 1_700_000_000_000

  it('copies shared files into the instance when missing there or newer in the shared layer', () => {
    const entries = [
      entry('missing-in-instance', t, null),
      entry('shared-newer', t + 5_000, t),
      entry('same-within-tolerance', t + MTIME_TOLERANCE_MS, t),
      entry('instance-newer', t, t + 5_000),
      entry('missing-in-shared', null, t),
      entry('missing-everywhere', null, null)
    ]
    expect(planSync(entries, 'in')).toEqual(['missing-in-instance', 'shared-newer'])
  })

  it('copies instance files back when missing in the shared layer or newer in the instance', () => {
    const entries = [
      entry('missing-in-shared', null, t),
      entry('instance-newer', t, t + MTIME_TOLERANCE_MS + 1),
      entry('same-within-tolerance', t, t + MTIME_TOLERANCE_MS),
      entry('shared-newer', t + 5_000, t),
      entry('missing-in-instance', t, null)
    ]
    expect(planSync(entries, 'out')).toEqual(['missing-in-shared', 'instance-newer'])
  })
})

describe('isSharedConfigEnabled', () => {
  const shard = { type: 'shard' as const, settings: DEFAULT_INSTANCE_SETTINGS }
  it('needs the global switch, a Shard instance and no per-instance opt-out', () => {
    expect(isSharedConfigEnabled(true, shard)).toBe(true)
    expect(isSharedConfigEnabled(false, shard)).toBe(false)
    expect(isSharedConfigEnabled(true, { ...shard, type: 'vanilla' })).toBe(false)
    expect(isSharedConfigEnabled(true, { ...shard, settings: { ...shard.settings, sharedConfig: false } })).toBe(false)
  })
})

describe('shared config round trip on disk', () => {
  let root: string
  let sharedDir: string
  let instanceDir: string

  const instance: Instance = {
    id: 'inst-1',
    name: 'Crystal',
    type: 'shard',
    minecraftVersion: '1.21.4',
    fabricLoader: null,
    shardBuild: null,
    createdAt: '2026-10-01T00:00:00Z',
    lastPlayedAt: null,
    playtimeMs: 0,
    icon: null,
    installState: 'installed',
    settings: DEFAULT_INSTANCE_SETTINGS
  }

  function service(globalEnabled = true): ReturnType<typeof createSharedConfigService> {
    const ctx = {
      paths: { sharedConfig: sharedDir },
      settings: { get: () => ({ sharedConfig: globalEnabled }) },
      services: {
        mods: { getBundledManifest: async () => manifest },
        instances: { folder: () => instanceDir }
      }
    }
    return createSharedConfigService(ctx as unknown as AppContext)
  }

  async function writeAt(path: string, content: string, mtimeMs: number): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content)
    await utimes(path, new Date(mtimeMs), new Date(mtimeMs))
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'shard-shared-config-'))
    sharedDir = join(root, 'shared')
    instanceDir = join(root, 'instance')
    await mkdir(sharedDir, { recursive: true })
    await mkdir(instanceDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('seeds the shared layer from the instance, then feeds newer shared files back in', async () => {
    const svc = service()
    const t0 = Date.now() - 60_000
    await writeAt(join(instanceDir, 'options.txt'), 'fov:70', t0)
    await writeAt(join(instanceDir, 'config', 'sodium-options.json'), '{"quality":1}', t0)

    await svc.syncIn(instance)
    await expect(stat(join(sharedDir, 'options.txt'))).rejects.toThrow()

    await svc.syncOut(instance)
    expect(await readFile(join(sharedDir, 'options.txt'), 'utf8')).toBe('fov:70')
    expect(await readFile(join(sharedDir, 'config', 'sodium-options.json'), 'utf8')).toBe('{"quality":1}')
    const sharedStat = await stat(join(sharedDir, 'options.txt'))
    expect(Math.abs(sharedStat.mtimeMs - t0)).toBeLessThan(MTIME_TOLERANCE_MS)

    // Another instance changed the shared copy later: it must win on the next launch.
    await writeAt(join(sharedDir, 'options.txt'), 'fov:90', t0 + 30_000)
    await svc.syncIn(instance)
    expect(await readFile(join(instanceDir, 'options.txt'), 'utf8')).toBe('fov:90')

    // Unchanged files are not copied back: the shared mtime stays where the newer write left it.
    await svc.syncOut(instance)
    expect(await readFile(join(sharedDir, 'options.txt'), 'utf8')).toBe('fov:90')

    // The game edited the file: it flows out again.
    await writeAt(join(instanceDir, 'options.txt'), 'fov:110', t0 + 45_000)
    await svc.syncOut(instance)
    expect(await readFile(join(sharedDir, 'options.txt'), 'utf8')).toBe('fov:110')
  })

  it('does nothing when the layer is disabled globally or for the instance', async () => {
    await writeAt(join(instanceDir, 'options.txt'), 'fov:70', Date.now() - 60_000)
    await service(false).syncOut(instance)
    await service().syncOut({ ...instance, type: 'vanilla' })
    await service().syncOut({ ...instance, settings: { ...instance.settings, sharedConfig: false } })
    await expect(stat(join(sharedDir, 'options.txt'))).rejects.toThrow()
  })
})
