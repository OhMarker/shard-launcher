import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, Square } from 'lucide-react'
import { formatBytes, formatEta, formatSpeed } from '@shared/format'
import { invoke } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useInstance } from '@/hooks/useInstances'
import { useActiveLaunch } from '@/stores/launch'
import { useUi } from '@/stores/ui'
import { Progress } from '@/components/ui/Progress'

/** Slim bottom bar that surfaces download progress and the running state globally. */
export function StatusBar() {
  const active = useActiveLaunch()
  const instance = useInstance(active?.instanceId ?? null)
  const setConsoleOpen = useUi((s) => s.setConsoleOpen)
  const navigate = useUi((s) => s.navigate)

  const download = active?.download
  const pct = download && download.totalBytes > 0 ? (download.doneBytes / download.totalBytes) * 100 : null
  const activeStep = active?.steps.find((s) => s.status === 'active')

  return (
    <AnimatePresence>
      {active && (
        <motion.footer
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 32, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 36 }}
          className="relative z-30 flex h-8 shrink-0 items-center gap-3 border-t border-line bg-[#07090f]/80 px-4 text-xs text-fg-muted backdrop-blur-md"
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              active.phase === 'running' ? 'bg-success shadow-[0_0_8px_rgb(52_211_153/0.8)]' : 'bg-accent animate-[pulse-soft_1.4s_ease-in-out_infinite]'
            )}
          />
          <span className="truncate font-medium text-fg">{instance?.name ?? 'Instance'}</span>
          <span className="truncate">
            {active.phase === 'running'
              ? 'Running'
              : (activeStep?.detail ?? activeStep?.label ?? active.message ?? 'Preparing')}
          </span>
          {active.phase === 'preparing' && (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Progress value={pct} size="xs" className="max-w-[320px]" striped={pct !== null} />
              {download && download.totalBytes > 0 && (
                <span className="shrink-0 font-mono tabular-nums text-fg-subtle">
                  {formatBytes(download.doneBytes)} / {formatBytes(download.totalBytes)} · {formatSpeed(download.bytesPerSecond)} ·{' '}
                  {formatEta(download.etaSeconds)}
                </span>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                navigate('home')
                setConsoleOpen(true)
              }}
              className="flex h-6 items-center gap-1 rounded-md px-2 text-fg-muted transition-colors hover:bg-white/8 hover:text-fg"
            >
              <ChevronUp className="size-3.5" /> Console
            </button>
            {active.phase === 'running' && (
              <button
                onClick={() => void invoke('launch:kill', { instanceId: active.instanceId })}
                className="flex h-6 items-center gap-1 rounded-md px-2 text-danger transition-colors hover:bg-danger/15"
              >
                <Square className="size-3 fill-current" /> Kill
              </button>
            )}
          </div>
        </motion.footer>
      )}
    </AnimatePresence>
  )
}
