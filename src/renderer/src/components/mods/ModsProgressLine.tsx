import { AnimatePresence, motion } from 'framer-motion'
import { LoaderCircle } from 'lucide-react'
import { type ModsProgress } from '@shared/types'
import { cn } from '@/lib/cn'
import { progressPercent } from '@/pages/mods/mods-utils'
import { Progress } from '@/components/ui/Progress'

/** Collapsible one-line status fed by `mods:progress` events. */
export function ModsProgressLine({
  progress,
  className
}: {
  progress: ModsProgress | null
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {progress && (
        <motion.div
          key="progress"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={cn('overflow-hidden', className)}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 pb-2 text-xs text-fg-muted">
            <LoaderCircle
              className="size-3.5 shrink-0 animate-[spin_0.9s_linear_infinite] text-accent"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{progress.message}</span>
            {progress.total > 0 && (
              <span className="shrink-0 font-mono tabular-nums text-fg-subtle">
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          <Progress value={progressPercent(progress)} size="xs" striped label={progress.message} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
