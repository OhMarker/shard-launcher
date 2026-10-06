/**
 * Launch state per instance. Every change is pushed to the renderer; download updates are
 * throttled to ~10 Hz with a trailing emit so the final numbers always arrive.
 */
import {
  type DownloadProgress,
  type LaunchMode,
  type LaunchProgress,
  type LaunchStep,
  type LaunchStepId,
  type StepStatus
} from '@shared/types'

export const STEP_LABELS: Record<LaunchStepId, string> = {
  version: 'Minecraft version',
  fabric: 'Fabric loader',
  java: 'Java runtime',
  client: 'Game client',
  libraries: 'Libraries',
  assets: 'Assets',
  mods: 'Bundled mods',
  shard: 'Shard client',
  config: 'Shared config',
  cosmetics: 'Cosmetics',
  classpath: 'Classpath',
  spawn: 'Launch'
}

export const STEP_ORDER: readonly LaunchStepId[] = [
  'version',
  'fabric',
  'java',
  'client',
  'libraries',
  'assets',
  'mods',
  'shard',
  'config',
  'cosmetics',
  'classpath',
  'spawn'
]

const DOWNLOAD_EMIT_INTERVAL_MS = 100

export function freshSteps(): LaunchStep[] {
  return STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: 'pending', detail: null }))
}

export function idleProgress(instanceId: string): LaunchProgress {
  return {
    instanceId,
    phase: 'idle',
    mode: 'launch',
    steps: freshSteps(),
    download: null,
    message: null,
    error: null,
    pid: null,
    startedAt: null,
    exitCode: null,
    crashReportPath: null
  }
}

export interface StepPatch {
  detail?: string | null
  /** Also replaces the top-level status message in the same emit. */
  message?: string | null
}

export class LaunchStateStore {
  private readonly states = new Map<string, LaunchProgress>()
  private readonly lastEmit = new Map<string, number>()
  private readonly trailing = new Map<string, NodeJS.Timeout>()

  constructor(private readonly emit: (state: LaunchProgress) => void) {}

  get(instanceId: string): LaunchProgress {
    return this.states.get(instanceId) ?? idleProgress(instanceId)
  }

  all(): LaunchProgress[] {
    return [...this.states.values()]
  }

  /** Resets every step and enters the preparing phase. */
  begin(instanceId: string, mode: LaunchMode): LaunchProgress {
    const state: LaunchProgress = { ...idleProgress(instanceId), mode, phase: 'preparing' }
    this.set(instanceId, state)
    return state
  }

  update(instanceId: string, patch: Partial<Omit<LaunchProgress, 'instanceId'>>): LaunchProgress {
    const next: LaunchProgress = { ...this.get(instanceId), ...patch, instanceId }
    this.set(instanceId, next)
    return next
  }

  setStep(instanceId: string, stepId: LaunchStepId, status: StepStatus, patch: StepPatch = {}): void {
    const current = this.get(instanceId)
    const steps = current.steps.map((step) =>
      step.id === stepId ? { ...step, status, detail: patch.detail === undefined ? step.detail : patch.detail } : step
    )
    const next: LaunchProgress = { ...current, steps }
    if (patch.message !== undefined) next.message = patch.message
    this.set(instanceId, next)
  }

  /** Throttled: download progress arrives far faster than the UI can usefully render. */
  download(instanceId: string, download: DownloadProgress, message: string): void {
    const next: LaunchProgress = { ...this.get(instanceId), download, message }
    this.states.set(instanceId, next)
    const now = Date.now()
    const last = this.lastEmit.get(instanceId) ?? 0
    if (now - last >= DOWNLOAD_EMIT_INTERVAL_MS) {
      this.clearTrailing(instanceId)
      this.lastEmit.set(instanceId, now)
      this.emit(next)
      return
    }
    if (this.trailing.has(instanceId)) return
    this.trailing.set(
      instanceId,
      setTimeout(() => {
        this.trailing.delete(instanceId)
        const latest = this.states.get(instanceId)
        if (!latest) return
        this.lastEmit.set(instanceId, Date.now())
        this.emit(latest)
      }, DOWNLOAD_EMIT_INTERVAL_MS - (now - last))
    )
  }

  private set(instanceId: string, state: LaunchProgress): void {
    this.states.set(instanceId, state)
    this.clearTrailing(instanceId)
    this.lastEmit.set(instanceId, Date.now())
    this.emit(state)
  }

  private clearTrailing(instanceId: string): void {
    const timer = this.trailing.get(instanceId)
    if (timer) {
      clearTimeout(timer)
      this.trailing.delete(instanceId)
    }
  }
}
