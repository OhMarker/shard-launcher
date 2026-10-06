import type {
  ModrinthProjectResponse,
  ModrinthSearchResponse,
  ModrinthVersionResponse
} from '@shared/schemas/modrinth'
import type {
  ModrinthFile,
  ModrinthProject,
  ModrinthSearchHit,
  ModrinthSearchResult,
  ModrinthVersion
} from '@shared/types'

type Hit = ModrinthSearchResponse['hits'][number]

function textOrNull(value: string | null | undefined): string | null {
  return value ? value : null
}

export function mapSearchHit(hit: Hit): ModrinthSearchHit {
  return {
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: textOrNull(hit.icon_url),
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories,
    displayCategories: hit.display_categories,
    versions: hit.versions,
    dateCreated: hit.date_created,
    dateModified: hit.date_modified,
    latestVersion: textOrNull(hit.latest_version),
    license: textOrNull(hit.license),
    clientSide: hit.client_side,
    serverSide: hit.server_side
  }
}

export function mapSearchResponse(res: ModrinthSearchResponse): ModrinthSearchResult {
  return {
    hits: res.hits.map(mapSearchHit),
    offset: res.offset,
    limit: res.limit,
    totalHits: res.total_hits
  }
}

export function mapProject(p: ModrinthProjectResponse): ModrinthProject {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    body: p.body,
    iconUrl: textOrNull(p.icon_url),
    categories: p.categories,
    additionalCategories: p.additional_categories,
    gameVersions: p.game_versions,
    loaders: p.loaders,
    gallery: p.gallery.map((g) => ({
      url: g.url,
      featured: g.featured,
      title: textOrNull(g.title),
      description: textOrNull(g.description)
    })),
    downloads: p.downloads,
    followers: p.followers,
    published: p.published,
    updated: p.updated,
    sourceUrl: textOrNull(p.source_url),
    issuesUrl: textOrNull(p.issues_url),
    wikiUrl: textOrNull(p.wiki_url),
    discordUrl: textOrNull(p.discord_url),
    license: p.license ? { id: p.license.id, name: p.license.name } : null,
    clientSide: p.client_side,
    serverSide: p.server_side
  }
}

export function mapVersion(v: ModrinthVersionResponse): ModrinthVersion {
  return {
    id: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    changelog: textOrNull(v.changelog),
    datePublished: v.date_published,
    downloads: v.downloads,
    versionType: v.version_type,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    files: v.files.map((f) => ({
      url: f.url,
      filename: f.filename,
      primary: f.primary,
      size: f.size,
      sha512: f.hashes.sha512.toLowerCase(),
      sha1: f.hashes.sha1 ? f.hashes.sha1.toLowerCase() : null
    })),
    dependencies: v.dependencies.map((d) => ({
      versionId: textOrNull(d.version_id),
      projectId: textOrNull(d.project_id),
      fileName: textOrNull(d.file_name),
      dependencyType: d.dependency_type
    }))
  }
}

/** hash -> version, with hash keys normalised to lower case. */
export function mapVersionMap(record: Record<string, ModrinthVersionResponse>): Record<string, ModrinthVersion> {
  const out: Record<string, ModrinthVersion> = {}
  for (const [hash, version] of Object.entries(record)) out[hash.toLowerCase()] = mapVersion(version)
  return out
}

/** The file to install for a version: the primary one, else the first jar, else the first file. */
export function primaryFile(version: ModrinthVersion): ModrinthFile | null {
  return (
    version.files.find((f) => f.primary) ??
    version.files.find((f) => f.filename.toLowerCase().endsWith('.jar')) ??
    version.files[0] ??
    null
  )
}
