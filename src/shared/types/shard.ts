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

/** Loopback account switching bridge for the running game (shard-client docs/ACCOUNT-SWITCH-API.md). */
export interface AccountBridgeInfo {
  /** `http://127.0.0.1:<port>` */
  url: string
  /** 64 hex chars; sent as `Authorization: Bearer <secret>`. */
  secret: string
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
  /** Present only while the launcher serves the account bridge for this launch (Shard instances). */
  accountBridge?: AccountBridgeInfo
  writtenAt: string
}
