export type InstanceType = 'shard' | 'vanilla'

export interface InstanceSettings {
  memoryMb: number
  /** Custom JDK path. null = managed runtime for the version's required Java major. */
  javaPath: string | null
  jvmArgs: string[]
  gameArgs: string[]
  width: number
  height: number
  fullscreen: boolean
  preLaunchHook: string
  postExitHook: string
  /** Sync the shared config layer into this instance. */
  sharedConfig: boolean
  /** Bundled mod slugs the user disabled for this instance. */
  disabledBundled: string[]
}

export type InstanceInstallState = 'pending' | 'installed' | 'broken'

export interface Instance {
  id: string
  name: string
  type: InstanceType
  minecraftVersion: string
  fabricLoader: string | null
  /** Installed Shard client build version, or null if none is available yet. */
  shardBuild: string | null
  createdAt: string
  lastPlayedAt: string | null
  playtimeMs: number
  icon: string | null
  installState: InstanceInstallState
  settings: InstanceSettings
}

export interface InstanceSummary extends Instance {
  folder: string
  diskUsageBytes: number | null
  running: boolean
}

export type VersionState = 'ready' | 'client-pending' | 'not-installed'
export type VersionKind = 'release' | 'snapshot'

export interface VersionEntry {
  id: string
  kind: VersionKind
  releaseTime: string
  /** Shard build that targets this version, if the client manifest has one. */
  shardBuild: string | null
  clientAvailable: boolean
  state: VersionState
  instanceIds: string[]
  diskUsageBytes: number | null
  latest: boolean
}

export interface VersionList {
  versions: VersionEntry[]
  fetchedAt: string
  /** True when served from the on-disk cache because Mojang could not be reached. */
  offline: boolean
  latestRelease: string | null
  latestShardBuild: string | null
}

export type JavaSource = 'mojang' | 'adoptium' | 'custom' | 'system'

export interface JavaRuntime {
  id: string
  major: number
  /** Absolute path to the java executable. */
  path: string
  version: string | null
  source: JavaSource
  valid: boolean
  component: string | null
}

export interface JavaValidation {
  valid: boolean
  version: string | null
  major: number | null
  error: string | null
}
