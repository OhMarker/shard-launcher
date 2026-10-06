import { beforeAll, describe, expect, it } from 'vitest'
import type {
  BundledModsManifest,
  InstalledMod,
  InstanceModsView,
  ModrinthGalleryItem,
  ModrinthVersion,
  ModsProgress
} from '@shared/types'

/**
 * The renderer helpers sit outside tsconfig.node.json's include list, so a static import would
 * fail the composite type check (TS6307). Vitest resolves the runtime specifier fine.
 */
interface ModsUtils {
  filterAndSortMods: (
    mods: readonly InstalledMod[],
    query: string,
    sort: 'name' | 'updated'
  ) => InstalledMod[]
  countUpdates: (mods: readonly InstalledMod[]) => number
  allInstalledMods: (view: InstanceModsView) => InstalledMod[]
  installedVersionIds: (view: InstanceModsView) => Set<string>
  hitState: (
    hit: { projectId: string; slug: string },
    view: InstanceModsView
  ) => 'install' | 'installed' | 'core' | 'conflict'
  conflictReason: (mod: InstalledMod, manifest: BundledModsManifest) => string | null
  instanceLabel: (i: { name: string; minecraftVersion: string }) => string
  splitImportPaths: (paths: readonly string[]) => {
    jars: string[]
    mrpacks: string[]
    other: string[]
  }
  modrinthModUrl: (slug: string) => string
  initials: (name: string) => string
  progressPercent: (p: ModsProgress) => number | null
  categoryLabel: (slug: string) => string
  toggleInList: <T>(list: readonly T[], value: T) => T[]
  sortGallery: (gallery: readonly ModrinthGalleryItem[]) => ModrinthGalleryItem[]
  versionsForGame: (versions: readonly ModrinthVersion[], gameVersion: string) => ModrinthVersion[]
  nextSearchOffset: (page: {
    offset: number
    limit: number
    totalHits: number
    hits: readonly unknown[]
  }) => number | undefined
}

const specifier = '../src/renderer/src/pages/mods/mods-utils'
let u: ModsUtils

beforeAll(async () => {
  u = (await import(specifier)) as ModsUtils
})

function mod(overrides: Partial<InstalledMod> & { name: string }): InstalledMod {
  return {
    fileName: `${overrides.name.toLowerCase()}.jar`,
    path: `C:/mods/${overrides.name}.jar`,
    enabled: true,
    source: 'modrinth',
    locked: false,
    version: '1.0.0',
    sha512: 'x',
    sizeBytes: 1000,
    modrinth: null,
    fabric: null,
    status: 'ok',
    update: null,
    ...overrides
  }
}

const manifest: BundledModsManifest = {
  schemaVersion: 1,
  updatedAt: '2026-10-06T00:00:00Z',
  mods: [
    {
      slug: 'fabric-api',
      name: 'Fabric API',
      required: true,
      locked: true,
      description: '',
      configFiles: []
    },
    {
      slug: 'sodium',
      name: 'Sodium',
      required: false,
      locked: true,
      description: '',
      configFiles: []
    }
  ],
  sharedFiles: [],
  conflicts: [{ slug: 'optifine', reason: 'Replaces the renderer Sodium already optimizes.' }]
}

const sodium = mod({
  name: 'Sodium',
  source: 'bundled',
  locked: true,
  modrinth: {
    projectId: 'AANobbMI',
    versionId: 'sodium-v1',
    slug: 'sodium',
    title: 'Sodium',
    iconUrl: null,
    author: 'jellysquid3',
    versionNumber: '0.6.0'
  }
})

const view: InstanceModsView = {
  instanceId: 'inst',
  minecraftVersion: '1.21.4',
  core: [
    { def: manifest.mods[0]!, state: 'waiting', installed: null },
    { def: manifest.mods[1]!, state: 'installed', installed: sodium }
  ],
  shard: {
    state: 'installed',
    build: '1.2.0',
    mod: mod({ name: 'Shard', source: 'shard', locked: true })
  },
  yours: [
    mod({
      name: 'Zoomify',
      modrinth: {
        projectId: 'zoomify-id',
        versionId: 'zoomify-v1',
        slug: 'zoomify',
        title: 'Zoomify',
        iconUrl: null,
        author: 'isxander',
        versionNumber: '2.0'
      }
    }),
    mod({ name: 'Alpha Local', source: 'local' })
  ],
  manifest
}

describe('mods-utils: your mods', () => {
  const a = mod({ name: 'Alpha' })
  const z = mod({
    name: 'Zeta',
    status: 'update-available',
    update: {
      versionId: 'v2',
      versionNumber: '2.0',
      fileName: 'zeta-2.jar',
      changelog: null,
      datePublished: '2026-05-01T00:00:00Z'
    }
  })
  const m = mod({
    name: 'Mid',
    status: 'update-available',
    update: {
      versionId: 'v3',
      versionNumber: '3.0',
      fileName: 'mid-3.jar',
      changelog: null,
      datePublished: '2026-06-01T00:00:00Z'
    }
  })

  it('sorts by name case-insensitively', () => {
    expect(u.filterAndSortMods([z, a, m], '', 'name').map((x) => x.name)).toEqual([
      'Alpha',
      'Mid',
      'Zeta'
    ])
  })

  it('puts mods with updates first, newest update first', () => {
    expect(u.filterAndSortMods([a, z, m], '', 'updated').map((x) => x.name)).toEqual([
      'Mid',
      'Zeta',
      'Alpha'
    ])
  })

  it('filters by name, file name, author, slug and fabric id', () => {
    const list = [
      mod({
        name: 'Zoomify',
        fabric: { id: 'zoomify', name: 'Zoomify', version: '1', description: null }
      }),
      mod({
        name: 'Other',
        modrinth: {
          projectId: 'p',
          versionId: 'v',
          slug: 'other',
          title: 'Other',
          iconUrl: null,
          author: 'isxander',
          versionNumber: null
        }
      })
    ]
    expect(u.filterAndSortMods(list, ' zoom', 'name').map((x) => x.name)).toEqual(['Zoomify'])
    expect(u.filterAndSortMods(list, 'ISXANDER', 'name').map((x) => x.name)).toEqual(['Other'])
    expect(u.filterAndSortMods(list, 'other.jar', 'name').map((x) => x.name)).toEqual(['Other'])
    expect(u.filterAndSortMods(list, 'nothing', 'name')).toEqual([])
  })

  it('counts pending updates', () => {
    expect(u.countUpdates([a, z, m])).toBe(2)
  })
})

describe('mods-utils: installed state', () => {
  it('collects every installed jar including core and the client', () => {
    expect(
      u
        .allInstalledMods(view)
        .map((m) => m.name)
        .sort()
    ).toEqual(['Alpha Local', 'Shard', 'Sodium', 'Zoomify'])
    expect([...u.installedVersionIds(view)].sort()).toEqual(['sodium-v1', 'zoomify-v1'])
  })

  it('classifies search hits', () => {
    expect(u.hitState({ projectId: 'any', slug: 'fabric-api' }, view)).toBe('core')
    expect(u.hitState({ projectId: 'AANobbMI', slug: 'renamed-sodium' }, view)).toBe('core')
    expect(u.hitState({ projectId: 'x', slug: 'optifine' }, view)).toBe('conflict')
    expect(u.hitState({ projectId: 'zoomify-id', slug: 'zoomify' }, view)).toBe('installed')
    expect(u.hitState({ projectId: 'new', slug: 'new-mod' }, view)).toBe('install')
  })

  it('explains conflicts from the manifest and falls back to generic copy', () => {
    const optifine = mod({
      name: 'OptiFine',
      status: 'conflict',
      modrinth: {
        projectId: 'o',
        versionId: 'ov',
        slug: 'optifine',
        title: 'OptiFine',
        iconUrl: null,
        author: 'sp614x',
        versionNumber: null
      }
    })
    expect(u.conflictReason(optifine, manifest)).toBe(
      'Replaces the renderer Sodium already optimizes.'
    )
    expect(u.conflictReason(mod({ name: 'Mystery', status: 'conflict' }), manifest)).toBe(
      'Known to conflict with Shard Core.'
    )
    expect(u.conflictReason(mod({ name: 'Fine' }), manifest)).toBeNull()
  })
})

describe('mods-utils: misc', () => {
  it('formats labels and urls', () => {
    expect(u.instanceLabel({ name: 'PvP', minecraftVersion: '1.21.4' })).toBe('PvP · 1.21.4')
    expect(u.modrinthModUrl('sodium')).toBe('https://modrinth.com/mod/sodium')
    expect(u.categoryLabel('world-generation')).toBe('World Generation')
  })

  it('splits import paths by extension', () => {
    expect(u.splitImportPaths(['a.JAR', 'b.mrpack', 'c.txt'])).toEqual({
      jars: ['a.JAR'],
      mrpacks: ['b.mrpack'],
      other: ['c.txt']
    })
  })

  it('builds initials', () => {
    expect(u.initials('Fabric API')).toBe('FA')
    expect(u.initials('Sodium')).toBe('SO')
    expect(u.initials('  ')).toBe('?')
  })

  it('computes progress percent', () => {
    expect(u.progressPercent({ instanceId: 'i', message: '', current: 2, total: 8 })).toBe(25)
    expect(u.progressPercent({ instanceId: 'i', message: '', current: 0, total: 0 })).toBeNull()
  })

  it('toggles list membership immutably', () => {
    const list = ['a']
    expect(u.toggleInList(list, 'b')).toEqual(['a', 'b'])
    expect(u.toggleInList(list, 'a')).toEqual([])
    expect(list).toEqual(['a'])
  })
})

describe('mods-utils: modrinth', () => {
  it('sorts featured gallery images first and keeps order otherwise', () => {
    const g = (url: string, featured: boolean): ModrinthGalleryItem => ({
      url,
      featured,
      title: null,
      description: null
    })
    expect(
      u.sortGallery([g('a', false), g('b', true), g('c', false), g('d', true)]).map((x) => x.url)
    ).toEqual(['b', 'd', 'a', 'c'])
  })

  it('filters versions for the game version, newest first', () => {
    const v = (id: string, gameVersions: string[], date: string): ModrinthVersion => ({
      id,
      projectId: 'p',
      name: id,
      versionNumber: id,
      changelog: null,
      datePublished: date,
      downloads: 0,
      versionType: 'release',
      gameVersions,
      loaders: ['fabric'],
      files: [],
      dependencies: []
    })
    const list = [
      v('old', ['1.21.4'], '2026-01-01T00:00:00Z'),
      v('other', ['1.21.1'], '2026-03-01T00:00:00Z'),
      v('new', ['1.21.4'], '2026-02-01T00:00:00Z')
    ]
    expect(u.versionsForGame(list, '1.21.4').map((x) => x.id)).toEqual(['new', 'old'])
  })

  it('pages search results by offset', () => {
    expect(u.nextSearchOffset({ offset: 0, limit: 20, totalHits: 45, hits: new Array(20) })).toBe(
      20
    )
    expect(
      u.nextSearchOffset({ offset: 40, limit: 20, totalHits: 45, hits: new Array(5) })
    ).toBeUndefined()
    expect(u.nextSearchOffset({ offset: 0, limit: 20, totalHits: 0, hits: [] })).toBeUndefined()
  })
})
