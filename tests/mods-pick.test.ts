import { describe, expect, it } from 'vitest'
import { ShardError } from '@shared/errors'
import type { ModrinthDependency, ModrinthProject, ModrinthVersion } from '@shared/types'
import { pickLatestCompatible } from '@main/modrinth/versions'
import { manifestConflictsFor, planInstall, type PlanContext, type PlannerClient } from '@main/mods/planner'

function version(
  id: string,
  projectId: string,
  overrides: Partial<ModrinthVersion> = {}
): ModrinthVersion {
  return {
    id,
    projectId,
    name: id,
    versionNumber: id,
    changelog: null,
    datePublished: '2025-01-01T00:00:00Z',
    downloads: 0,
    versionType: 'release',
    gameVersions: ['1.21.4'],
    loaders: ['fabric'],
    files: [
      {
        url: `https://cdn.example/${id}.jar`,
        filename: `${id}.jar`,
        primary: true,
        size: 1,
        sha512: id.padEnd(128, '0'),
        sha1: null
      }
    ],
    dependencies: [],
    ...overrides
  }
}

function dep(projectId: string, dependencyType: ModrinthDependency['dependencyType'], versionId: string | null = null): ModrinthDependency {
  return { projectId, versionId, fileName: null, dependencyType }
}

function project(id: string, slug: string, title: string): ModrinthProject {
  return {
    id,
    slug,
    title,
    description: '',
    body: '',
    iconUrl: null,
    categories: [],
    additionalCategories: [],
    gameVersions: ['1.21.4'],
    loaders: ['fabric'],
    gallery: [],
    downloads: 0,
    followers: 0,
    published: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    sourceUrl: null,
    issuesUrl: null,
    wikiUrl: null,
    discordUrl: null,
    license: null,
    clientSide: 'required',
    serverSide: 'optional'
  }
}

describe('pickLatestCompatible', () => {
  const mc = '1.21.4'

  it('prefers releases over betas over alphas regardless of date', () => {
    const alpha = version('alpha', 'p', { versionType: 'alpha', datePublished: '2025-03-01T00:00:00Z' })
    const beta = version('beta', 'p', { versionType: 'beta', datePublished: '2025-02-01T00:00:00Z' })
    const release = version('release', 'p', { versionType: 'release', datePublished: '2025-01-01T00:00:00Z' })
    expect(pickLatestCompatible([alpha, beta, release], mc)?.id).toBe('release')
    expect(pickLatestCompatible([alpha, beta], mc)?.id).toBe('beta')
    expect(pickLatestCompatible([alpha], mc)?.id).toBe('alpha')
  })

  it('picks the newest within a tier', () => {
    const older = version('older', 'p', { datePublished: '2025-01-01T00:00:00Z' })
    const newer = version('newer', 'p', { datePublished: '2025-06-01T00:00:00Z' })
    expect(pickLatestCompatible([older, newer], mc)?.id).toBe('newer')
    expect(pickLatestCompatible([newer, older], mc)?.id).toBe('newer')
  })

  it('ignores versions for other loaders or game versions', () => {
    const forge = version('forge', 'p', { loaders: ['forge'] })
    const otherMc = version('other', 'p', { gameVersions: ['1.21.1'] })
    const multi = version('multi', 'p', { loaders: ['quilt', 'fabric'], gameVersions: ['1.21.3', '1.21.4'] })
    expect(pickLatestCompatible([forge, otherMc, multi], mc)?.id).toBe('multi')
    expect(pickLatestCompatible([forge, otherMc], mc)).toBeNull()
    expect(pickLatestCompatible([], mc)).toBeNull()
  })
})

describe('planInstall', () => {
  const FABRIC_API = 'P7dR8mSH'

  const projects: Record<string, ModrinthProject> = {
    X: project('X', 'x-mod', 'X Mod'),
    Y: project('Y', 'y-lib', 'Y Library'),
    Z: project('Z', 'z-core', 'Z Core'),
    O: project('O', 'o-extra', 'O Extra'),
    I: project('I', 'incompat', 'Incompatible Thing'),
    N: project('N', 'nobuild', 'No Build Yet'),
    [FABRIC_API]: project(FABRIC_API, 'fabric-api', 'Fabric API'),
    OPTIFABRIC: project('OPTIFABRIC', 'optifabric', 'OptiFabric')
  }

  const versions: Record<string, ModrinthVersion[]> = {
    X: [
      version('x-old', 'X', { datePublished: '2024-12-01T00:00:00Z' }),
      version('x-new', 'X', {
        datePublished: '2025-02-01T00:00:00Z',
        dependencies: [dep(FABRIC_API, 'required'), dep('Y', 'required'), dep('O', 'optional'), dep('I', 'incompatible')]
      }),
      version('x-beta', 'X', { versionType: 'beta', datePublished: '2025-03-01T00:00:00Z' })
    ],
    Y: [version('y-1', 'Y', { dependencies: [dep('Z', 'required'), dep('X', 'required')] })],
    Z: [version('z-1', 'Z')],
    O: [version('o-1', 'O')],
    N: [version('n-forge', 'N', { loaders: ['forge'] })],
    OPTIFABRIC: [version('of-1', 'OPTIFABRIC')],
    [FABRIC_API]: [version('fapi-1', FABRIC_API)]
  }

  const client: PlannerClient = {
    async getProject(idOrSlug) {
      const found = projects[idOrSlug] ?? Object.values(projects).find((p) => p.slug === idOrSlug)
      if (!found) throw new ShardError('NOT_FOUND', idOrSlug)
      return found
    },
    async getProjects(ids) {
      return ids.map((id) => projects[id]).filter((p): p is ModrinthProject => p !== undefined)
    },
    async getVersion(versionId) {
      const found = Object.values(versions)
        .flat()
        .find((v) => v.id === versionId)
      if (!found) throw new ShardError('NOT_FOUND', versionId)
      return found
    },
    async getVersions(idOrSlug) {
      return versions[idOrSlug] ?? []
    }
  }

  function context(overrides: Partial<PlanContext> = {}): PlanContext {
    return {
      instanceId: 'inst',
      gameVersion: '1.21.4',
      installed: new Map([
        ['Z', { projectId: 'Z', slug: 'z-core', title: 'Z Core', bundled: false }],
        ['I', { projectId: 'I', slug: 'incompat', title: 'Incompatible Thing', bundled: false }]
      ]),
      bundled: new Map([[FABRIC_API, { slug: 'fabric-api', title: 'Fabric API' }]]),
      bundledSlugs: new Set(['fabric-api', 'sodium']),
      conflicts: [{ slug: 'optifabric', reason: 'Incompatible with Sodium and Iris.' }],
      ...overrides
    }
  }

  it('walks required dependencies, skips installed and bundled ones, and collects optionals', async () => {
    const plan = await planInstall(client, context(), 'X')

    expect(plan.items.map((i) => [i.projectId, i.version.id, i.reason, i.title])).toEqual([
      ['X', 'x-new', 'requested', 'X Mod'],
      ['Y', 'y-1', 'required', 'Y Library']
    ])
    expect(plan.alreadyInstalled).toEqual(
      expect.arrayContaining([
        { projectId: FABRIC_API, title: 'Fabric API', bundled: true },
        { projectId: 'Z', title: 'Z Core', bundled: false }
      ])
    )
    expect(plan.optional.map((i) => [i.projectId, i.version.id, i.slug])).toEqual([['O', 'o-1', 'o-extra']])
    expect(plan.conflicts).toEqual([
      { slug: 'incompat', reason: 'X Mod is marked incompatible with Incompatible Thing, which is installed' }
    ])
  })

  it('honours an explicit version id', async () => {
    const plan = await planInstall(client, context(), 'x-mod', 'x-old')
    expect(plan.items.map((i) => i.version.id)).toEqual(['x-old'])
    expect(plan.optional).toEqual([])
  })

  it('reports manifest conflicts for the requested project', async () => {
    const plan = await planInstall(client, context(), 'optifabric')
    expect(plan.conflicts).toEqual([{ slug: 'optifabric', reason: 'Incompatible with Sodium and Iris.' }])
    expect(plan.items).toHaveLength(1)
    expect(manifestConflictsFor({ id: 'OPTIFABRIC', slug: 'optifabric' }, context().conflicts)).toHaveLength(1)
    expect(manifestConflictsFor({ id: 'X', slug: 'x-mod' }, context().conflicts)).toHaveLength(0)
  })

  it('refuses to plan a bundled project and reports it as already installed', async () => {
    const plan = await planInstall(client, context(), 'fabric-api')
    expect(plan.items).toEqual([])
    expect(plan.alreadyInstalled).toEqual([{ projectId: FABRIC_API, title: 'Fabric API', bundled: true }])
  })

  it('reports an installed project without a version switch as already installed', async () => {
    const plan = await planInstall(client, context(), 'Z')
    expect(plan.items).toEqual([])
    expect(plan.alreadyInstalled).toEqual([{ projectId: 'Z', title: 'Z Core', bundled: false }])
  })

  it('throws MOD_NO_COMPATIBLE_VERSION when nothing fits the instance', async () => {
    await expect(planInstall(client, context(), 'N')).rejects.toMatchObject({ code: 'MOD_NO_COMPATIBLE_VERSION' })
    await expect(planInstall(client, context({ gameVersion: '1.22' }), 'X')).rejects.toMatchObject({
      code: 'MOD_NO_COMPATIBLE_VERSION'
    })
  })
})
