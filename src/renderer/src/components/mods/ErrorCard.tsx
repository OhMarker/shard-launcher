import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { ShardError } from '@shared/errors'
import { errorMessage, errorTitle } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

export interface ErrorCardProps {
  error: unknown
  onRetry?: () => void
  retrying?: boolean
  /** Shown under the offline title instead of the raw error message. */
  offlineHint?: string
  className?: string
}

/** Inline error with a Retry button; shows a calmer offline note for OFFLINE errors. */
export function ErrorCard({
  error,
  onRetry,
  retrying,
  offlineHint = 'This needs a connection. Everything already installed keeps working.',
  className
}: ErrorCardProps) {
  const offline = ShardError.from(error).code === 'OFFLINE'
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-[14px] border p-4',
        offline ? 'border-line bg-white/4' : 'border-danger/30 bg-danger/10',
        className
      )}
    >
      <span
        className={cn('mt-0.5 shrink-0 [&_svg]:size-5', offline ? 'text-fg-muted' : 'text-danger')}
      >
        {offline ? <WifiOff /> : <CircleAlert />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-semibold', offline ? 'text-fg' : 'text-danger')}>
          {errorTitle(error)}
        </div>
        <div className="mt-0.5 break-words text-[13px] text-fg-muted">
          {offline ? offlineHint : errorMessage(error)}
        </div>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          leftIcon={<RefreshCw />}
          loading={retrying}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  )
}
