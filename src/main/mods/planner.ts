import { ShardError } from '@shared/errors'
import type {
  ConflictDef,
  InstallPlan,
  InstallPlanItem,
  ModrinthDependency,
  ModrinthProject,
  ModrinthVersion
} from '@shared/types'
import { FABRIC_LOADER, isCompatible, pickLatestCompatible } from '../modrinth/versions'

/** The slice of the Modrinth client the planner needs (stubbed in tests). */
export interface PlannerClient {
  getProject(idOrSlug: string): Promise<ModrinthProject>
  getProjects(ids: string[]): Promise<ModrinthProject[]>
  getVersion(versionId: string): Promise<ModrinthVersion>
  getVersions(idOrSlug: string, opts?: { gameVersion?: string; loaders?: string[] }): Promise<ModrinthVersion[]>
}

export interface InstalledProjectInfo {
  projectId: string
  slug: string | null
  title: string
  bundled: boolean
}

export interface BundledProjectRef {
  slug: string
  title: string
}

export interface PlanContext {
  instanceId: string
  gameVersion: string
  /** Installed mods that Modrinth knows about, by project id. */
  installed: Map<string, InstalledProjectInfo>
  /** Every project in the bundled set, by project id (installed or not). */
  bundled: Map<string, BundledProjectRef>
  /** Bundled slugs, for projects whose id could not be resolved (offline). */
  bundledSlugs: Set<string>
  conflicts: ConflictDef[]
}

interface ResolvedDependency {
  projectId: string
  version: ModrinthVersion | null
}

function isNotFound(err: unknown): boolean {
  return err instanceof ShardError && err.code === 'NOT_FOUND'
}

/**
 * Picks the version to install for a dependency: the pinned version when it fits the
 * instance, else the latest compatible version of the project.
 */
async function resolveDependency(
  client: PlannerClient,
  dep: ModrinthDependency,
  gameVersion: string
): Promise<ResolvedDependency | null> {
  let pinned: ModrinthVersion | null = null
  if (dep.versionId) {
    try {
      pinned = await client.getVersion(dep.versionId)
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
  }
  const projectId = dep.projectId ?? pinned?.projectId ?? null
  if (!projectId) return null
  if (pinned && pinned.projectId === projectId && isCompatible(pinned, gameVersion)) {
    return { projectId, version: pinned }
  }
  const versions = await client.getVersions(projectId, { gameVersion, loaders: [FABRIC_LOADER] })
  return { projectId, version: pickLatestCompatible(versions, gameVersion) }
}

function placeholderItem(projectId: string, version: ModrinthVersion, reason: InstallPlanItem['reason']): InstallPlanItem {
  return { projectId, slug: null, title: projectId, iconUrl: null, version, reason }
}

/**
 * Breadth-first walk over `required` dependencies. Projects already installed or part of the
 * bundled set are reported in `alreadyInstalled` and not descended into.
 */
export async function walkRequiredDependencies(
  client: PlannerClient,
  ctx: PlanContext,
  roots: ModrinthVersion[],
  visited: Set<string>,
  alreadyInstalled: InstallPlan['alreadyInstalled'],
  ownerTitle: string
): Promise<InstallPlanItem[]> {
  const items: InstallPlanItem[] = []
  const queue: ModrinthDependency[] = roots.flatMap((v) => v.dependencies.filter((d) => d.dependencyType === 'required'))
  while (queue.length > 0) {
    const dep = queue.shift()
    if (!dep) break
    if (dep.projectId && visited.has(dep.projectId)) continue
    const resolved = await resolveDependency(client, dep, ctx.gameVersion)
    if (!resolved || visited.has(resolved.projectId)) continue
    visited.add(resolved.projectId)

    const installed = ctx.installed.get(resolved.projectId)
    if (installed) {
      alreadyInstalled.push({ projectId: installed.projectId, title: installed.title, bundled: installed.bundled })
      continue
    }
    const bundled = ctx.bundled.get(resolved.projectId)
    if (bundled) {
      alreadyInstalled.push({ projectId: resolved.projectId, title: bundled.title, bundled: true })
      continue
    }
    if (!resolved.version) {
      throw new ShardError(
        'MOD_NO_COMPATIBLE_VERSION',
        `A mod required by ${ownerTitle} has no Fabric build for Minecraft ${ctx.gameVersion} yet`,
        { details: { projectId: resolved.projectId } }
      )
    }
    items.push(placeholderItem(resolved.projectId, resolved.version, 'required'))
    queue.push(...resolved.version.dependencies.filter((d) => d.dependencyType === 'required'))
  }
  return items
}

/** Fills slug/title/icon for items created from bare project ids. */
export async function fillProjectInfo(client: PlannerClient, items: InstallPlanItem[]): Promise<void> {
  const ids = [...new Set(items.filter((i) => i.slug === null).map((i) => i.projectId))]
  if (ids.length === 0) return
  const projects = new Map((await client.getProjects(ids)).map((p) => [p.id, p]))
  for (const item of items) {
    const project = projects.get(item.projectId)
    if (!project) continue
    item.slug = project.slug
    item.title = project.title
    item.iconUrl = project.iconUrl
  }
}

/** Manifest conflicts that name this project by slug or id. */
export function manifestConflictsFor(project: Pick<ModrinthProject, 'id' | 'slug'>, conflicts: ConflictDef[]): ConflictDef[] {
  return conflicts.filter((c) => c.slug === project.slug || c.slug === project.id)
}

/**
 * Resolves what installing `projectId` means for the instance: the requested version (or the
 * latest compatible one), its required dependencies, optional dependencies the user may add,
 * what is already there, and anything that conflicts with Shard.
 */
export async function planInstall(
  client: PlannerClient,
  ctx: PlanContext,
  projectId: string,
  requestedVersionId?: string
): Promise<InstallPlan> {
  const project = await client.getProject(projectId)
  const conflicts = manifestConflictsFor(project, ctx.conflicts)
  const alreadyInstalled: InstallPlan['alreadyInstalled'] = []
  const empty = (): InstallPlan => ({ instanceId: ctx.instanceId, items: [], optional: [], alreadyInstalled, conflicts })

  const isBundled = ctx.bundled.has(project.id) || ctx.bundledSlugs.has(project.slug)
  if (isBundled) {
    alreadyInstalled.push({ projectId: project.id, title: project.title, bundled: true })
    return empty()
  }
  const existing = ctx.installed.get(project.id)
  if (existing && !requestedVersionId) {
    alreadyInstalled.push({ projectId: project.id, title: project.title, bundled: false })
    return empty()
  }

  let version: ModrinthVersion | null
  if (requestedVersionId) {
    version = await client.getVersion(requestedVersionId)
    if (version.projectId !== project.id) {
      throw new ShardError('INVALID_INPUT', `Version ${requestedVersionId} does not belong to ${project.title}`)
    }
  } else {
    const versions = await client.getVersions(project.id, { gameVersion: ctx.gameVersion, loaders: [FABRIC_LOADER] })
    version = pickLatestCompatible(versions, ctx.gameVersion)
  }
  if (!version) {
    throw new ShardError(
      'MOD_NO_COMPATIBLE_VERSION',
      `${project.title} has no Fabric build for Minecraft ${ctx.gameVersion} yet`,
      { details: { projectId: project.id } }
    )
  }

  const visited = new Set<string>([project.id])
  const requested: InstallPlanItem = {
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    iconUrl: project.iconUrl,
    version,
    reason: 'requested'
  }
  const required = await walkRequiredDependencies(client, ctx, [version], visited, alreadyInstalled, project.title)

  const optional: InstallPlanItem[] = []
  for (const dep of version.dependencies.filter((d) => d.dependencyType === 'optional')) {
    if (dep.projectId && (visited.has(dep.projectId) || ctx.installed.has(dep.projectId) || ctx.bundled.has(dep.projectId))) {
      continue
    }
    const resolved = await resolveDependency(client, dep, ctx.gameVersion)
    if (!resolved || !resolved.version) continue
    if (visited.has(resolved.projectId) || ctx.installed.has(resolved.projectId) || ctx.bundled.has(resolved.projectId)) {
      continue
    }
    visited.add(resolved.projectId)
    optional.push(placeholderItem(resolved.projectId, resolved.version, 'optional'))
  }

  for (const dep of version.dependencies.filter((d) => d.dependencyType === 'incompatible')) {
    const installed = dep.projectId ? ctx.installed.get(dep.projectId) : undefined
    if (!installed) continue
    conflicts.push({
      slug: installed.slug ?? installed.projectId,
      reason: `${project.title} is marked incompatible with ${installed.title}, which is installed`
    })
  }

  await fillProjectInfo(client, [...required, ...optional])
  return {
    instanceId: ctx.instanceId,
    items: [requested, ...required],
    optional,
    alreadyInstalled,
    conflicts
  }
}
