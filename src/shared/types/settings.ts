import { type UpdateChannel } from './updates'

export type Theme = 'dark' | 'light'
export type LaunchBehavior = 'keep' | 'minimize' | 'close'
export type ModelAnimation = 'idle' | 'walk' | 'run'
export type BackView = 'cape' | 'elytra'
export type Platform = 'win32' | 'darwin' | 'linux'

export interface WindowState {
  width: number
  height: number
  x: number | null
  y: number | null
  maximized: boolean
}

export interface Settings {
  accent: string
  theme: Theme
  defaultInstanceId: string | null
  launchBehavior: LaunchBehavior
  closeToTray: boolean
  /** Check the bundled mod set against Modrinth before each launch. */
  autoUpdateMods: boolean
  /** Global switch for the shared config layer. */
  sharedConfig: boolean
  downloadConcurrency: number
  /** Custom data directory. null = platform default. */
  dataDir: string | null
  java: {
    memoryMb: number
    jvmArgs: string[]
  }
  discordRpc: boolean
  analytics: boolean
  showSnapshots: boolean
  updateChannel: UpdateChannel
  /** Launcher version whose "What's new" the user has already seen. */
  lastSeenVersion: string | null
  /** Overrides MSA_CLIENT_ID from the environment when set. */
  msaClientId: string | null
  manifestUrls: {
    shard: string | null
    bundledMods: string | null
    cosmetics: string | null
  }
  viewer: {
    animation: ModelAnimation
    back: BackView
    autoRotate: boolean
  }
  window: WindowState
  onboarded: boolean
}

export interface SystemInfo {
  platform: Platform
  arch: string
  totalMemoryMb: number
  freeMemoryMb: number
  cpuCount: number
  launcherVersion: string
  electronVersion: string
  dataDir: string
  configDir: string
  logsDir: string
  isPackaged: boolean
  isDev: boolean
  msaConfigured: boolean
}

export interface MigrationProgress {
  phase: 'copying' | 'verifying' | 'cleaning' | 'done'
  copiedBytes: number
  totalBytes: number
  currentFile: string | null
}

export interface ToastPayload {
  kind: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string | null
}
