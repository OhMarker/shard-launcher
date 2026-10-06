export type UpdateChannel = 'stable' | 'beta'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  /** Running from source or an unpackaged build: electron-updater is inactive. */
  | 'unsupported'

export interface UpdateDownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface LauncherUpdateState {
  currentVersion: string
  channel: UpdateChannel
  status: UpdateStatus
  availableVersion: string | null
  releaseNotes: string | null
  progress: UpdateDownloadProgress | null
  error: string | null
  lastCheckedAt: string | null
}

export interface ReleaseNote {
  tag: string
  name: string
  body: string
  publishedAt: string
  url: string
  prerelease: boolean
}

export interface NewsItem {
  id: string
  title: string
  category: string | null
  date: string
  text: string
  imageUrl: string | null
  readMoreUrl: string | null
}
