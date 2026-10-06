import { type Theme } from './settings'

/** One published build of the Shard client jar. See CONTRACT.md. */
export interface ShardBuild {
  version: string
  /** Minecraft versions this build runs on. */
  minecraft: string[]
  /** Semver range of supported Fabric loader versions. */
  fabricLoader: string
  url: string
  sha512: string
  changelog: string
  releasedAt: string
}

export interface ShardManifest {
  latest: string
  builds: ShardBuild[]
}

export interface ShardManifestView {
  manifest: ShardManifest | null
  source: 'remote' | 'cache' | 'none'
  fetchedAt: string | null
  error: string | null
}

/** Written to <instance>/launcher-info.json before every launch. See CONTRACT.md. */
export interface LauncherInfo {
  schemaVersion: 1
  launcherVersion: string
  accountId: string | null
  username: string | null
  minecraftVersion: string
  instanceId: string
  instanceName: string
  shardBuild: string | null
  accent: string
  theme: Theme
  /** Absolute path to equipped.json. */
  equippedPath: string
  /** Absolute path to the shared config folder, or null when disabled for this instance. */
  sharedConfigPath: string | null
  writtenAt: string
}
