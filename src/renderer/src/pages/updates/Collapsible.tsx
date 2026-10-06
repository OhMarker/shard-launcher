import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'

export interface CollapsibleProps {
  open: boolean
  onToggle: () => void
  header: ReactNode
  children: ReactNode
  className?: string
}

/** Card with a toggle header and an animated body; used for release notes and build history. */
export function Collapsible({ open, onToggle, header, children, className }: CollapsibleProps) {
  const id = useId()
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/4"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-90')} aria-hidden />
        <div className="min-w-0 flex-1">{header}</div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
