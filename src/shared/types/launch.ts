import { type SerializedError } from '../errors'

export type LaunchStepId =
  | 'version'
  | 'fabric'
  | 'java'
  | 'client'
  | 'libraries'
  | 'assets'
  | 'mods'
  | 'shard'
  | 'config'
  | 'cosmetics'
  | 'classpath'
  | 'spawn'

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed'

export interface LaunchStep {
  id: LaunchStepId
  label: string
  status: StepStatus
  detail: string | null
}

export interface DownloadProgress {
  totalBytes: number
  doneBytes: number
  totalFiles: number
  doneFiles: number
  bytesPerSecond: number
  etaSeconds: number | null
  currentFile: string | null
}

export type LaunchPhase = 'idle' | 'preparing' | 'running' | 'exited' | 'crashed' | 'failed'
export type LaunchMode = 'launch' | 'install' | 'repair'

export interface LaunchProgress {
  instanceId: string
  phase: LaunchPhase
  mode: LaunchMode
  steps: LaunchStep[]
  download: DownloadProgress | null
  message: string | null
  error: SerializedError | null
  pid: number | null
  startedAt: string | null
  exitCode: number | null
  crashReportPath: string | null
}

export type ConsoleStream = 'stdout' | 'stderr' | 'launcher'
export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface ConsoleLine {
  id: number
  ts: number
  stream: ConsoleStream
  level: ConsoleLevel
  text: string
}

export interface CrashReport {
  path: string
  content: string
  /** First meaningful line, for the toast and the support copy. */
  summary: string
}
