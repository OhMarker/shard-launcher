// ---------------------------------------------------------------------------
// Bundled mod set ("Shard Core")
// ---------------------------------------------------------------------------

export interface BundledModDef {
  /** Modrinth project slug. */
  slug: string
  name: string
  /** Required mods cannot be disabled (Fabric API). */
  required: boolean
  /** Locked mods cannot be removed by the user. All bundled mods are locked. */
  locked: boolean
  description: string
  /** Paths relative to the instance folder that belong to the shared config layer. */
  configFiles: string[]
}

export interface ConflictDef {
  slug: string
  reason: string
}

export interface BundledModsManifest {
  schemaVersion: number
  updatedAt: string
  mods: BundledModDef[]
  /** Extra shared files not owned by a specific mod (options.txt, servers.dat, ...). */
  sharedFiles: string[]
  /** Modrinth projects known to conflict with Shard. */
  conflicts: ConflictDef[]
}

// ---------------------------------------------------------------------------
// Installed mods
// ---------------------------------------------------------------------------

export type ModSource = 'bundled' | 'shard' | 'modrinth' | 'local'
export type ModStatus = 'ok' | 'update-available' | 'conflict' | 'disabled'

export interface ModrinthRef {
  projectId: string
  versionId: string
  slug: string | null
  title: string | null
  iconUrl: string | null
  author: string | null
  versionNumber: string | null
}

export interface FabricModMeta {
  id: string
  name: string
  version: string
  description: string | null
}

export interface ModUpdateInfo {
  versionId: string
  versionNumber: string
  fileName: string
  changelog: string | null
  datePublished: string
}

export interface InstalledMod {
  fileName: string
  path: string
  enabled: boolean
  source: ModSource
  locked: boolean
  name: string
  version: string | null
  sha512: string
  sizeBytes: number
  modrinth: ModrinthRef | null
  fabric: FabricModMeta | null
  status: ModStatus
  update: ModUpdateInfo | null
}

export type BundledState = 'installed' | 'waiting' | 'disabled' | 'not-installed'

export interface BundledModStatus {
  def: BundledModDef
  state: BundledState
  installed: InstalledMod | null
}

export type ShardJarState = 'installed' | 'pending' | 'not-applicable'

export interface InstanceModsView {
  instanceId: string
  minecraftVersion: string
  core: BundledModStatus[]
  shard: { state: ShardJarState; mod: InstalledMod | null; build: string | null }
  yours: InstalledMod[]
  manifest: BundledModsManifest
}

// ---------------------------------------------------------------------------
// Modrinth
// ---------------------------------------------------------------------------

export type ModrinthSortIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'

export interface ModrinthSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl: string | null
  downloads: number
  follows: number
  categories: string[]
  displayCategories: string[]
  versions: string[]
  dateCreated: string
  dateModified: string
  latestVersion: string | null
  license: string | null
  clientSide: string
  serverSide: string
}

export interface ModrinthSearchResult {
  hits: ModrinthSearchHit[]
  offset: number
  limit: number
  totalHits: number
}

export interface ModrinthGalleryItem {
  url: string
  featured: boolean
  title: string | null
  description: string | null
}

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  body: string
  iconUrl: string | null
  categories: string[]
  additionalCategories: string[]
  gameVersions: string[]
  loaders: string[]
  gallery: ModrinthGalleryItem[]
  downloads: number
  followers: number
  published: string
  updated: string
  sourceUrl: string | null
  issuesUrl: string | null
  wikiUrl: string | null
  discordUrl: string | null
  license: { id: string; name: string } | null
  clientSide: string
  serverSide: string
}

export type ModrinthVersionType = 'release' | 'beta' | 'alpha'

export interface ModrinthFile {
  url: string
  filename: string
  primary: boolean
  size: number
  sha512: string
  sha1: string | null
}

export type ModrinthDependencyType = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface ModrinthDependency {
  versionId: string | null
  projectId: string | null
  fileName: string | null
  dependencyType: ModrinthDependencyType
}

export interface ModrinthVersion {
  id: string
  projectId: string
  name: string
  versionNumber: string
  changelog: string | null
  datePublished: string
  downloads: number
  versionType: ModrinthVersionType
  gameVersions: string[]
  loaders: string[]
  files: ModrinthFile[]
  dependencies: ModrinthDependency[]
}

export type InstallReason = 'requested' | 'required' | 'optional'

export interface InstallPlanItem {
  projectId: string
  slug: string | null
  title: string
  iconUrl: string | null
  version: ModrinthVersion
  reason: InstallReason
}

export interface InstallPlan {
  instanceId: string
  /** Requested project plus required dependencies, in install order. */
  items: InstallPlanItem[]
  /** Optional dependencies the user may opt into. */
  optional: InstallPlanItem[]
  alreadyInstalled: { projectId: string; title: string; bundled: boolean }[]
  conflicts: ConflictDef[]
}

export interface InstallResult {
  installed: InstalledMod[]
  skipped: string[]
}

export interface CopyModsResult {
  copied: string[]
  failed: { name: string; reason: string }[]
}

export interface MrpackImportResult {
  name: string
  installed: number
  skipped: string[]
}

export interface ModsProgress {
  instanceId: string
  message: string
  current: number
  total: number
}
