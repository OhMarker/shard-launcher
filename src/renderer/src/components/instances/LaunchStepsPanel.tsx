import { Circle, CircleAlert, CircleCheck, LoaderCircle, SkipForward } from 'lucide-react'
import { type ReactNode } from 'react'
import { formatBytes, formatEta, formatSpeed } from '@shared/format'
import { type DownloadProgress, type LaunchProgress, type StepStatus } from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'

export interface LaunchStepsPanelProps {
  progress: LaunchProgress
  /** Shown for install/repair runs only; launches cannot be cancelled mid-preparation. */
  onCancel?: () => void
  cancelling?: boolean
  className?: string
}

const STATUS_ICON: Record<StepStatus, ReactNode> = {
  pending: <Circle className="size-3.5 text-fg-subtle" />,
  active: <LoaderCircle className="size-3.5 animate-[spin_0.9s_linear_infinite] text-accent" />,
  done: <CircleCheck className="size-3.5 text-success" />,
  skipped: <SkipForward className="size-3.5 text-fg-subtle" />,
  failed: <CircleAlert className="size-3.5 text-danger" />
}

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: 'text-fg-subtle',
  active: 'text-fg',
  done: 'text-fg-muted',
  skipped: 'text-fg-subtle line-through',
  failed: 'text-danger'
}

const MODE_TITLE: Record<LaunchProgress['mode'], string> = {
  launch: 'Preparing to launch',
  install: 'Installing',
  repair: 'Repairing'
}

function DownloadBlock({ download }: { download: DownloadProgress }) {
  const pct = download.totalBytes > 0 ? (download.doneBytes / download.totalBytes) * 100 : null
  return (
    <div className="mt-2 space-y-1.5">
      <Progress value={pct} size="sm" striped label="Download progress" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-fg-subtle">
        <span>
          {formatBytes(download.doneBytes)} / {download.totalBytes > 0 ? formatBytes(download.totalBytes) : '…'}
        </span>
        {download.totalFiles > 0 && (
          <span>
            {download.doneFiles}/{download.totalFiles} files
          </span>
        )}
        <span>{formatSpeed(download.bytesPerSecond)}</span>
        <span>{formatEta(download.etaSeconds)} left</span>
        {download.currentFile && (
          <span className="min-w-0 max-w-full truncate text-fg-subtle/70" title={download.currentFile}>
            {download.currentFile}
          </span>
        )}
      </div>
    </div>
  )
}

/** Ordered LaunchStep list with the active step's download progress. */
export function LaunchStepsPanel({ progress, onCancel, cancelling, className }: LaunchStepsPanelProps) {
  const canCancel = onCancel !== undefined && progress.mode !== 'launch'
  const hasSteps = progress.steps.length > 0

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={MODE_TITLE[progress.mode]}
      className={cn('glass rounded-[16px] p-4', className)}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="size-2 rounded-full bg-accent animate-[pulse-soft_1.4s_ease-in-out_infinite]" aria-hidden />
          {MODE_TITLE[progress.mode]}
          {progress.message && <span className="font-normal text-fg-muted">· {progress.message}</span>}
        </div>
        {canCancel && (
          <Button size="xs" variant="ghost" onClick={onCancel} loading={cancelling}>
            Cancel
          </Button>
        )}
      </header>

      {hasSteps ? (
        <ol className="mt-3 space-y-0.5">
          {progress.steps.map((step) => (
            <li
              key={step.id}
              className={cn(
                'rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors duration-200',
                step.status === 'active' && 'bg-white/5'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                  {STATUS_ICON[step.status]}
                </span>
                <span className={cn('shrink-0 font-medium', STATUS_TEXT[step.status])}>{step.label}</span>
                {step.detail && (
                  <span className="min-w-0 truncate text-xs text-fg-subtle" title={step.detail}>
                    {step.detail}
                  </span>
                )}
                <span className="sr-only">{step.status}</span>
              </div>
              {step.status === 'active' && progress.download && (
                <div className="pl-[26px]">
                  <DownloadBlock download={progress.download} />
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-3">
          <Progress value={null} size="sm" label="Starting" />
        </div>
      )}
    </section>
  )
}
