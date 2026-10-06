import { join } from 'node:path'
import { ShardError } from '@shared/errors'
import { BundledProjectsCacheSchema, type BundledProjectInfo } from '@shared/schemas/mod-index'
import { BundledModsManifestSchema } from '@shared/schemas/shard'
import type { BundledModsManifest } from '@shared/types'
import type { AppContext } from '../context'
import { createLogger } from '../logger'
import { readJsonOrNull, writeJson } from '../util/fs'
import { JsonCache } from '../util/json-cache'
import bundled from './bundled-mods.json'

const log = createLogger('mods:manifest')
const MANIFEST_MAX_AGE_MS = 6 * 60 * 60 * 1000
const PROJECTS_CACHE_FILE = 'bundled-projects.json'

export type BundledProjects = Map<string, BundledProjectInfo>

/**
 * The bundled mod set: hosted copy (cached on disk, 6h) with the shipped JSON as fallback,
 * plus slug -> Modrinth project resolution cached for offline use.
 */
export class BundledManifestSource {
  private readonly cache: JsonCache
  private readonly projectsFile: string
  private readonly resolved: BundledProjects = new Map()
  private readonly unresolved = new Set<string>()
  private projectsLoaded = false
  private shipped: BundledModsManifest | null = null

  constructor(private readonly ctx: AppContext) {
    this.cache = new JsonCache(ctx.paths.cache)
    this.projectsFile = join(ctx.paths.cache, PROJECTS_CACHE_FILE)
  }

  /** The manifest compiled into the launcher. Throws MANIFEST_INVALID if the shipped file is broken. */
  shippedManifest(): BundledModsManifest {
    if (!this.shipped) {
      const parsed = BundledModsManifestSchema.safeParse(bundled)
      if (!parsed.success) {
        throw new ShardError('MANIFEST_INVALID', 'The bundled mod manifest shipped with the launcher is invalid', {
          details: parsed.error.issues.slice(0, 10),
          recoverable: false
        })
      }
      this.shipped = parsed.data
    }
    return this.shipped
  }

  async get(opts: { refresh?: boolean } = {}): Promise<BundledModsManifest> {
    const url = this.ctx.manifestUrls().bundledMods
    try {
      const result = await this.cache.fetch(url, BundledModsManifestSchema, {
        maxAgeMs: opts.refresh ? 0 : MANIFEST_MAX_AGE_MS
      })
      return result.data
    } catch (err) {
      const e = ShardError.from(err)
      log.warn(`Hosted bundled manifest unavailable (${e.code}: ${e.message}); using the shipped copy`)
      return this.shippedManifest()
    }
  }

  /**
   * slug -> project id/title/icon for the bundled set. Resolved through Modrinth once and
   * persisted; offline the last resolution is served and unknown slugs are simply absent.
   */
  async projects(manifest: BundledModsManifest): Promise<BundledProjects> {
    if (!this.projectsLoaded) {
      this.projectsLoaded = true
      const cached = await readJsonOrNull(this.projectsFile, BundledProjectsCacheSchema)
      if (cached) for (const [slug, info] of Object.entries(cached.projects)) this.resolved.set(slug, info)
    }
    const missing = manifest.mods.map((m) => m.slug).filter((s) => !this.resolved.has(s) && !this.unresolved.has(s))
    if (missing.length > 0) {
      try {
        const list = await this.ctx.services.modrinth.getProjects(missing)
        const bySlug = new Map(list.map((p) => [p.slug, p]))
        for (const slug of missing) {
          const project = bySlug.get(slug)
          if (project) this.resolved.set(slug, { projectId: project.id, title: project.title, iconUrl: project.iconUrl })
          else {
            this.unresolved.add(slug)
            log.warn(`Bundled mod "${slug}" does not exist on Modrinth`)
          }
        }
        await writeJson(this.projectsFile, {
          version: 1,
          fetchedAt: new Date().toISOString(),
          projects: Object.fromEntries(this.resolved)
        })
      } catch (err) {
        const e = ShardError.from(err)
        log.warn(`Could not resolve bundled projects on Modrinth (${e.code}: ${e.message})`)
      }
    }
    return new Map(this.resolved)
  }
}

/** Project ids of the bundled set that have been resolved so far. */
export function bundledProjectIds(projects: BundledProjects): Set<string> {
  return new Set([...projects.values()].map((p) => p.projectId))
}
