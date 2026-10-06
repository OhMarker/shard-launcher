import { Bug, Copy, FolderOpen, Terminal, TriangleAlert, Wrench, X } from 'lucide-react'
import { useState } from 'react'
import { ERROR_TITLES } from '@shared/errors'
import { type InstanceSummary, type LaunchProgress } from '@shared/types'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle, invoke, platform } from '@/lib/api'
import { useLaunch } from '@/stores/launch'
import { useUi } from '@/stores/ui'
import { Button, IconButton } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { buildSupportReport } from './support-report'
import { useCrashReport } from './useHomeData'

export interface CrashCardProps {
  instance: InstanceSummary
  progress: LaunchProgress
  onDismiss: () => void
}

/** Shown on Home when the selected instance's last run ended in a crash. */
export function CrashCard({ instance, progress, onDismiss }: CrashCardProps) {
  const toast = useUi((s) => s.toast)
  const setConsoleOpen = useUi((s) => s.setConsoleOpen)
  const { data: info } = useSystemInfo()
  const { data: report, isLoading } = useCrashReport(instance.id, progress.crashReportPath)
  const [copying, setCopying] = useState(false)

  const summary = report?.summary ?? progress.message ?? 'Minecraft closed unexpectedly.'
  const reportPath = report?.path ?? progress.crashReportPath

  const copyForSupport = async (): Promise<void> => {
    setCopying(true)
    try {
      const store = useLaunch.getState()
      if ((store.console[instance.id] ?? []).length === 0) await store.loadConsole(instance.id).catch(() => undefined)
      const consoleLines = useLaunch.getState().console[instance.id] ?? []
      const text = buildSupportReport({
        launcherVersion: info?.launcherVersion ?? 'unknown',
        platform,
        instanceName: instance.name,
        instanceType: instance.type,
        minecraftVersion: instance.minecraftVersion,
        shardBuild: instance.shardBuild,
        exitCode: progress.exitCode,
        summary,
        crashReportPath: reportPath,
        consoleLines
      })
      await invoke('app:copyToClipboard', { text })
      toast({ kind: 'success', title: 'Copied for support', message: 'Paste it into a GitHub issue or the support channel.' })
    } catch (err) {
      toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
    } finally {
      setCopying(false)
    }
  }

  const openReport = (): void => {
    if (!reportPath) return
    void invoke('app:showItemInFolder', { path: reportPath }).catch((err: unknown) =>
      toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
    )
  }

  return (
    <section role="alert" className="relative rounded-[16px] border border-danger/30 bg-danger/8 p-4 shadow-[0_0_40px_-16px_rgb(251_113_133/0.5)]">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-danger/15 text-danger" aria-hidden>
          <Bug className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-fg">
            Minecraft crashed
            {progress.exitCode !== null && <span className="font-mono text-xs font-normal text-fg-muted">exit code {progress.exitCode}</span>}
          </div>
          {isLoading ? (
            <Skeleton className="mt-1.5 h-3.5 w-3/4" />
          ) : (
            <p className="selectable mt-1 line-clamp-3 break-words font-mono text-[12.5px] leading-snug text-fg-muted" title={summary}>
              {summary}
            </p>
          )}
        </div>
        <IconButton label="Dismiss" size="xs" onClick={onDismiss} className="-mr-1 -mt-1">
          <X />
        </IconButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" leftIcon={<Copy />} onClick={() => void copyForSupport()} loading={copying}>
          Copy for support
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<FolderOpen />} onClick={openReport} disabled={!reportPath}>
          Open crash report
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<Terminal />} onClick={() => setConsoleOpen(true)}>
          Open console
        </Button>
      </div>
    </section>
  )
}

export interface FailureCardProps {
  progress: LaunchProgress
  onRepair: () => void
  repairing: boolean
  onDismiss: () => void
}

/** Shown when a launch or install never got off the ground (phase `failed`). */
export function FailureCard({ progress, onRepair, repairing, onDismiss }: FailureCardProps) {
  const error = progress.error
  const title = error ? ERROR_TITLES[error.code] : progress.mode === 'launch' ? 'Launch failed' : 'Installation failed'
  const message = error?.message ?? progress.message ?? 'Check the console for details.'
  return (
    <section role="alert" className="relative rounded-[16px] border border-warning/30 bg-warning/8 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-warning/15 text-warning" aria-hidden>
          <TriangleAlert className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{title}</div>
          <p className="selectable mt-1 break-words text-[13px] leading-snug text-fg-muted">{message}</p>
        </div>
        <IconButton label="Dismiss" size="xs" onClick={onDismiss} className="-mr-1 -mt-1">
          <X />
        </IconButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" leftIcon={<Wrench />} onClick={onRepair} loading={repairing}>
          Repair instance
        </Button>
      </div>
    </section>
  )
}
