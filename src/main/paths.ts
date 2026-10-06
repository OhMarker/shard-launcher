import { homedir } from 'node:os'
import { join } from 'node:path'
import { PRODUCT_NAME } from '@shared/constants'

/**
 * Platform data roots:
 *  Windows  %APPDATA%/Shard
 *  macOS    ~/Library/Application Support/Shard
 *  Linux    ~/.local/share/Shard (XDG_DATA_HOME honoured)
 */
export function defaultDataDir(): string {
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), PRODUCT_NAME)
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', PRODUCT_NAME)
    default:
      return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), PRODUCT_NAME)
  }
}

export interface Paths {
  /** Always the platform default. Holds settings.json, accounts and logs so they survive a data-dir move. */
  configDir: string
  /** Where the heavy, movable content lives (instances, libraries, assets, java). */
  dataDir: string
  electronData: string
  logs: string
  instances: string
  libraries: string
  assets: string
  versions: string
  java: string
  cache: string
  temp: string
  skins: string
  sharedConfig: string
  cosmetics: string
  accountsFile: string
  skinsFile: string
  javaRuntimesFile: string
}

export function resolvePaths(configDir: string, dataDir: string): Paths {
  return {
    configDir,
    dataDir,
    electronData: join(configDir, 'electron-data'),
    logs: join(configDir, 'logs'),
    instances: join(dataDir, 'instances'),
    libraries: join(dataDir, 'libraries'),
    assets: join(dataDir, 'assets'),
    versions: join(dataDir, 'versions'),
    java: join(dataDir, 'java'),
    cache: join(dataDir, 'cache'),
    temp: join(dataDir, 'temp'),
    skins: join(dataDir, 'skins'),
    sharedConfig: join(dataDir, 'shared-config'),
    cosmetics: join(dataDir, 'cosmetics'),
    accountsFile: join(configDir, 'accounts.json'),
    skinsFile: join(dataDir, 'skins', 'library.json'),
    javaRuntimesFile: join(dataDir, 'java', 'runtimes.json')
  }
}

/** Sub-folders that move when the user changes the data directory. */
export const MOVABLE_DIRS = [
  'instances',
  'libraries',
  'assets',
  'versions',
  'java',
  'cache',
  'skins',
  'shared-config',
  'cosmetics'
] as const

/** Maven coordinate -> relative path (group/artifact/version/artifact-version[-classifier].ext). */
export function mavenToPath(name: string): string {
  const [coords, ext = 'jar'] = name.split('@', 2)
  const parts = (coords ?? '').split(':')
  const group = parts[0] ?? ''
  const artifact = parts[1] ?? ''
  const version = parts[2] ?? ''
  const classifier = parts[3]
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`
  return [...group.split('.'), artifact, version, file].join('/')
}
