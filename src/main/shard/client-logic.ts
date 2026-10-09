/**
 * Pure helpers for the Shard client integration: build selection, jar naming and the
 * launcher-info payload. Nothing here touches Electron or the file system.
 */
import { pickBuildForVersion } from '@shared/minecraft-version'
import {
  type AccountBridgeInfo,
  type Instance,
  type LauncherInfo,
  type ShardBuild,
  type ShardManifest,
  type Theme
} from '@shared/types'
import { isSharedConfigEnabled } from './shared-config-plan'

/** Matches the launcher-managed client jar, enabled or disabled, in any letter case. */
export const SHARD_JAR_PATTERN = /^shard-.+\.jar(?:\.disabled)?$/i

/** File name of the client jar for a build. The version comes from a remote manifest, so it is kept to safe characters. */
export function shardJarName(version: string): string {
  return `shard-${version.replace(/[^A-Za-z0-9._+-]/g, '-')}.jar`
}

/** Newest build whose `minecraft` list contains the version, or null (client pending / no manifest). */
export function selectBuild(manifest: ShardManifest | null, minecraftVersion: string): ShardBuild | null {
  if (!manifest) return null
  return pickBuildForVersion(manifest.builds, minecraftVersion)
}

/** Shard jars in a mods folder that are not the wanted file. `keep` null means every Shard jar is stale. */
export function staleShardJars(fileNames: readonly string[], keep: string | null): string[] {
  return fileNames.filter((name) => SHARD_JAR_PATTERN.test(name) && name !== keep)
}

export interface LauncherInfoInput {
  launcherVersion: string
  instance: Pick<Instance, 'id' | 'name' | 'type' | 'minecraftVersion' | 'shardBuild' | 'settings'>
  session: { accountId: string; username: string } | null
  settings: { accent: string; theme: Theme; sharedConfig: boolean }
  /** Absolute path to equipped.json. */
  equippedPath: string
  /** Absolute path to the shared config folder. */
  sharedConfigDir: string
  /** The account bridge serving this launch, or null/absent when there is none. */
  accountBridge?: AccountBridgeInfo | null
  now: Date
}

/** Payload of `<instance>/launcher-info.json`, which the Shard client reads on startup. */
export function buildLauncherInfo(input: LauncherInfoInput): LauncherInfo {
  const { instance, session, settings } = input
  return {
    schemaVersion: 1,
    launcherVersion: input.launcherVersion,
    accountId: session?.accountId ?? null,
    username: session?.username ?? null,
    minecraftVersion: instance.minecraftVersion,
    instanceId: instance.id,
    instanceName: instance.name,
    shardBuild: instance.shardBuild,
    accent: settings.accent,
    theme: settings.theme,
    equippedPath: input.equippedPath,
    sharedConfigPath: isSharedConfigEnabled(settings.sharedConfig, instance) ? input.sharedConfigDir : null,
    ...(input.accountBridge ? { accountBridge: { url: input.accountBridge.url, secret: input.accountBridge.secret } } : {}),
    writtenAt: input.now.toISOString()
  }
}
