/** meta.fabricmc.net client: loader resolution and profile JSON, cached on disk. */
import { join } from 'node:path'
import { URLS } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { FabricLoaderListSchema, type FabricLoaderEntry } from '@shared/schemas/fabric'
import { VersionJsonSchema, type VersionJson } from '@shared/schemas/mojang'
import { createLogger } from '../logger'
import { HttpError, httpJson } from '../net/http'
import { readJsonOrNull, writeJson } from '../util/fs'

const log = createLogger('fabric')

export function fabricProfileId(minecraftVersion: string, loaderVersion: string): string {
  return `fabric-loader-${loaderVersion}-${minecraftVersion}`
}

function unavailable(minecraftVersion: string, cause?: unknown): ShardError {
  return new ShardError('FABRIC_UNAVAILABLE', `Fabric does not support ${minecraftVersion} yet`, { cause })
}

function isClientError(err: unknown): err is HttpError {
  return err instanceof HttpError && err.status >= 400 && err.status < 500
}

/** Newest stable loader for the version (falls back to the newest of any kind). */
export async function resolveLoader(minecraftVersion: string, signal?: AbortSignal): Promise<FabricLoaderEntry> {
  const url = `${URLS.fabricMeta}/versions/loader/${encodeURIComponent(minecraftVersion)}`
  let entries
  try {
    entries = await httpJson(url, FabricLoaderListSchema, { signal })
  } catch (err) {
    if (isClientError(err)) throw unavailable(minecraftVersion, err)
    throw err
  }
  const pick = entries.find((entry) => entry.loader.stable) ?? entries[0]
  if (!pick) throw unavailable(minecraftVersion)
  log.debug(`Resolved Fabric loader ${pick.loader.version} for ${minecraftVersion}`)
  return pick
}

/** Profile JSON for a loader + game version pair. Immutable upstream, so cached forever. */
export async function fetchProfile(
  minecraftVersion: string,
  loaderVersion: string,
  versionsDir: string,
  signal?: AbortSignal
): Promise<VersionJson> {
  const id = fabricProfileId(minecraftVersion, loaderVersion)
  const file = join(versionsDir, id, `${id}.json`)
  const cached = await readJsonOrNull(file, VersionJsonSchema)
  if (cached) return cached

  const url = `${URLS.fabricMeta}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  let profile: VersionJson
  try {
    profile = await httpJson(url, VersionJsonSchema, { signal })
  } catch (err) {
    if (isClientError(err)) throw unavailable(minecraftVersion, err)
    throw err
  }
  await writeJson(file, profile)
  return profile
}
