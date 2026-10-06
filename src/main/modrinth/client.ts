import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import {
  ModrinthProjectListSchema,
  ModrinthProjectSchema,
  ModrinthSearchResponseSchema,
  ModrinthVersionListSchema,
  ModrinthVersionMapSchema,
  ModrinthVersionSchema
} from '@shared/schemas/modrinth'
import type { ModrinthProject, ModrinthSearchResult, ModrinthVersion } from '@shared/types'
import type { AppContext, ModrinthClient, ModrinthSearchParams } from '../context'
import { mapProject, mapSearchResponse, mapVersion, mapVersionMap } from './mapping'
import { ModrinthTransport } from './transport'
import { FABRIC_LOADER, pickLatestCompatible } from './versions'

const PROJECTS_CHUNK = 100
const HASHES_CHUNK = 500

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

function normaliseHashes(hashes: string[]): string[] {
  return unique(hashes.map((h) => h.toLowerCase()))
}

/** Modrinth facets: AND between groups, OR within a group. */
export function buildSearchFacets(gameVersion: string, categories: string[] = []): string[][] {
  return [
    ['project_type:mod'],
    [`categories:${FABRIC_LOADER}`],
    [`versions:${gameVersion}`],
    ...categories.map((c) => [`categories:${c}`])
  ]
}

export class ModrinthApi implements ModrinthClient {
  private readonly hashCache = new Map<string, ModrinthVersion>()

  constructor(readonly transport: ModrinthTransport) {}

  async search(params: ModrinthSearchParams): Promise<ModrinthSearchResult> {
    const res = await this.transport.get('/search', ModrinthSearchResponseSchema, {
      query: {
        query: params.query,
        facets: JSON.stringify(buildSearchFacets(params.gameVersion, params.categories)),
        index: params.index,
        offset: params.offset,
        limit: params.limit
      }
    })
    return mapSearchResponse(res)
  }

  async getProject(idOrSlug: string): Promise<ModrinthProject> {
    try {
      return mapProject(await this.transport.get(`/project/${encodeURIComponent(idOrSlug)}`, ModrinthProjectSchema))
    } catch (err) {
      throw notFoundAs(err, `Project "${idOrSlug}" was not found on Modrinth`)
    }
  }

  async getProjects(ids: string[]): Promise<ModrinthProject[]> {
    const wanted = unique(ids)
    if (wanted.length === 0) return []
    const out: ModrinthProject[] = []
    for (const part of chunk(wanted, PROJECTS_CHUNK)) {
      const list = await this.transport.get('/projects', ModrinthProjectListSchema, { query: { ids: part } })
      out.push(...list.map(mapProject))
    }
    return out
  }

  async getVersions(idOrSlug: string, opts: { gameVersion?: string; loaders?: string[] } = {}): Promise<ModrinthVersion[]> {
    const query: Record<string, string[]> = {}
    if (opts.loaders && opts.loaders.length > 0) query.loaders = opts.loaders
    if (opts.gameVersion) query.game_versions = [opts.gameVersion]
    try {
      const list = await this.transport.get(
        `/project/${encodeURIComponent(idOrSlug)}/version`,
        ModrinthVersionListSchema,
        { query }
      )
      return list.map(mapVersion)
    } catch (err) {
      throw notFoundAs(err, `Project "${idOrSlug}" was not found on Modrinth`)
    }
  }

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    try {
      return mapVersion(await this.transport.get(`/version/${encodeURIComponent(versionId)}`, ModrinthVersionSchema))
    } catch (err) {
      throw notFoundAs(err, `Version "${versionId}" was not found on Modrinth`)
    }
  }

  async getVersionsByHashes(sha512s: string[]): Promise<Record<string, ModrinthVersion>> {
    const out: Record<string, ModrinthVersion> = {}
    const missing: string[] = []
    for (const hash of normaliseHashes(sha512s)) {
      const cached = this.hashCache.get(hash)
      if (cached) out[hash] = cached
      else missing.push(hash)
    }
    for (const part of chunk(missing, HASHES_CHUNK)) {
      const found = mapVersionMap(
        await this.transport.post('/version_files', { hashes: part, algorithm: 'sha512' }, ModrinthVersionMapSchema)
      )
      for (const [hash, version] of Object.entries(found)) {
        this.hashCache.set(hash, version)
        out[hash] = version
      }
    }
    return out
  }

  async getUpdates(
    sha512s: string[],
    opts: { gameVersion: string; loaders: string[] }
  ): Promise<Record<string, ModrinthVersion>> {
    const out: Record<string, ModrinthVersion> = {}
    for (const part of chunk(normaliseHashes(sha512s), HASHES_CHUNK)) {
      const found = mapVersionMap(
        await this.transport.post(
          '/version_files/update',
          { hashes: part, algorithm: 'sha512', loaders: opts.loaders, game_versions: [opts.gameVersion] },
          ModrinthVersionMapSchema
        )
      )
      Object.assign(out, found)
    }
    return out
  }

  pickLatestCompatible(versions: ModrinthVersion[], gameVersion: string): ModrinthVersion | null {
    return pickLatestCompatible(versions, gameVersion)
  }
}

function notFoundAs(err: unknown, message: string): unknown {
  if (err instanceof ShardError && err.code === 'NOT_FOUND') {
    return new ShardError('NOT_FOUND', message, { details: err.details, cause: err })
  }
  return err
}

export function createModrinthClient(ctx: AppContext): ModrinthClient {
  return new ModrinthApi(
    new ModrinthTransport({
      baseUrl: URLS.modrinth,
      userAgent: () => ctx.modrinthUserAgent()
    })
  )
}
