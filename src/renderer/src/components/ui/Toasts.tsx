import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { useUi, type Toast } from '@/stores/ui'

const icons = {
  info: <Info className="text-info" />,
  success: <CircleCheck className="text-success" />,
  warning: <TriangleAlert className="text-warning" />,
  error: <CircleAlert className="text-danger" />
}

const bars = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger'
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast)
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.durationMs)
    return () => clearTimeout(t)
  }, [toast.id, toast.durationMs, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      role="status"
      className="glass-strong pointer-events-auto relative w-[340px] overflow-hidden rounded-[14px] bg-[#0b0f18]/92 p-3.5 pr-10"
    >
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{icons[toast.kind]}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-fg">{toast.title}</div>
          {toast.message && <div className="mt-0.5 break-words text-[13px] leading-snug text-fg-muted">{toast.message}</div>}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick()
                dismiss(toast.id)
              }}
              className="mt-2 text-[13px] font-medium text-accent hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      </div>
      <button
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
        className="absolute right-2 top-2 rounded-md p-1 text-fg-subtle transition-colors hover:bg-white/8 hover:text-fg"
      >
        <X className="size-4" />
      </button>
      <motion.div
        className={cn('absolute bottom-0 left-0 h-0.5 opacity-70', bars[toast.kind])}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
      />
    </motion.div>
  )
}

export function ToastViewport() {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[110] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
