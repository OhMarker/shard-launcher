/**
 * Turns a (merged) version JSON into the JVM and game argument lists. Pure so the
 * substitution logic is unit tested without Electron.
 */
import { type Argument, type VersionJson } from '@shared/schemas/mojang'
import { type OsInfo, type RuleEnvironment, type RuleFeatures, rulesAllow } from './rules'

export const LAUNCHER_NAME = 'shard-launcher'
export const CLIENT_ID = Buffer.from(LAUNCHER_NAME, 'utf8').toString('base64')

/** The vanilla launcher's default GC tuning. */
export const DEFAULT_JVM_FLAGS: readonly string[] = [
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+UseG1GC',
  '-XX:G1NewSizePercent=20',
  '-XX:G1ReservePercent=20',
  '-XX:MaxGCPauseMillis=50',
  '-XX:G1HeapRegionSize=32M'
]

const MAX_INITIAL_HEAP_MB = 2048

export interface SessionArguments {
  username: string
  /** With or without dashes; dashes are stripped. */
  uuid: string
  accessToken: string
  xuid: string
}

export interface ArgumentParams {
  os: OsInfo
  features: RuleFeatures
  session: SessionArguments
  versionName: string
  versionType: string
  gameDirectory: string
  assetsRoot: string
  assetsIndexName: string
  nativesDirectory: string
  libraryDirectory: string
  launcherVersion: string
  classpath: readonly string[]
  memoryMb: number
  jvmArgs: readonly string[]
  gameArgs: readonly string[]
  width: number
  height: number
  fullscreen: boolean
}

export interface BuiltArguments {
  jvm: string[]
  game: string[]
  mainClass: string
}

export function classpathSeparator(os: OsInfo): string {
  return os.name === 'windows' ? ';' : ':'
}

/** Expands rule-guarded entries into a flat list, dropping entries the rules reject. */
export function flattenArguments(args: readonly Argument[] | undefined, env: RuleEnvironment): string[] {
  const out: string[] = []
  for (const arg of args ?? []) {
    if (typeof arg === 'string') {
      out.push(arg)
      continue
    }
    if (!rulesAllow(arg.rules, env)) continue
    if (Array.isArray(arg.value)) out.push(...arg.value)
    else out.push(arg.value)
  }
  return out
}

/** Replaces every `${name}` with its value; unknown placeholders become the empty string. */
export function substitutePlaceholders(value: string, vars: Readonly<Record<string, string>>): string {
  return value.replace(/\$\{([^}]*)\}/g, (_match, key: string) => vars[key] ?? '')
}

export function placeholderValues(params: ArgumentParams): Record<string, string> {
  const separator = classpathSeparator(params.os)
  return {
    auth_player_name: params.session.username,
    auth_uuid: params.session.uuid.replace(/-/g, ''),
    auth_access_token: params.session.accessToken,
    auth_session: params.session.accessToken,
    auth_xuid: params.session.xuid,
    user_type: 'msa',
    user_properties: '{}',
    version_name: params.versionName,
    version_type: params.versionType,
    game_directory: params.gameDirectory,
    assets_root: params.assetsRoot,
    assets_index_name: params.assetsIndexName,
    natives_directory: params.nativesDirectory,
    library_directory: params.libraryDirectory,
    launcher_name: LAUNCHER_NAME,
    launcher_version: params.launcherVersion,
    classpath: params.classpath.join(separator),
    classpath_separator: separator,
    resolution_width: String(params.width),
    resolution_height: String(params.height),
    clientid: CLIENT_ID,
    quickPlayPath: '',
    quickPlaySingleplayer: '',
    quickPlayMultiplayer: '',
    quickPlayRealms: ''
  }
}

export function buildArguments(resolved: VersionJson, params: ArgumentParams): BuiltArguments {
  const env: RuleEnvironment = { os: params.os, features: params.features }
  const vars = placeholderValues(params)
  const substitute = (value: string): string => substitutePlaceholders(value, vars)

  const memory = Math.max(512, Math.floor(params.memoryMb))
  const prefix = [
    `-Xms${Math.min(memory, MAX_INITIAL_HEAP_MB)}M`,
    `-Xmx${memory}M`,
    ...DEFAULT_JVM_FLAGS,
    ...params.jvmArgs
  ]

  let versionJvm: string[]
  let versionGame: string[]
  if (resolved.arguments) {
    versionJvm = flattenArguments(resolved.arguments.jvm, env).map(substitute)
    versionGame = flattenArguments(resolved.arguments.game, env).map(substitute)
  } else {
    versionJvm = [`-Djava.library.path=${params.nativesDirectory}`, '-cp', params.classpath.join(classpathSeparator(params.os))]
    versionGame = (resolved.minecraftArguments ?? '')
      .split(' ')
      .filter((part) => part.length > 0)
      .map(substitute)
  }

  const game = [...versionGame, ...params.gameArgs]
  if (params.fullscreen) game.push('--fullscreen')

  return { jvm: [...prefix, ...versionJvm], game, mainClass: resolved.mainClass }
}
