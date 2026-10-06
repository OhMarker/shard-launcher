import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Button, IconButton } from './Button'
import { useConfirmStore } from './confirm'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Hide the close button and ignore Escape/backdrop (for blocking flows). */
  blocking?: boolean
  className?: string
  bodyClassName?: string
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-80px)] h-[calc(100vh-80px)]'
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  blocking,
  className,
  bodyClassName
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)
  // Keep the latest onClose without re-running the focus effect when a parent re-renders.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !blocking) {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (nodes.length === 0) return
        const first = nodes[0]!
        const last = nodes[nodes.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
      const prev = previouslyFocused.current as HTMLElement | null
      prev?.focus?.()
    }
  }, [open, blocking])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            onMouseDown={() => {
              if (!blocking) onClose()
            }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
            className={cn(
              'glass-strong relative flex w-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[#0b0f18]/90',
              sizes[size],
              size !== 'full' && 'max-h-[calc(100vh-80px)]',
              className
            )}
          >
            {(title || !blocking) && (
              <div className="flex items-start gap-4 px-6 pt-5">
                <div className="min-w-0 flex-1">
                  {title && <h2 className="text-lg font-semibold leading-tight text-fg">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
                </div>
                {!blocking && (
                  <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
                    <X />
                  </IconButton>
                )}
              </div>
            )}
            <div className={cn('scroll-area min-h-0 flex-1 px-6 py-5', bodyClassName)}>{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Renders the dialog behind `confirm()` from './confirm'. Mount once at the app root. */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current)
  const settle = useConfirmStore((s) => s.settle)
  return (
    <Dialog
      open={current !== null}
      onClose={() => settle(false)}
      title={current?.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            {current?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={current?.danger ? 'danger' : 'primary'} onClick={() => settle(true)} data-autofocus>
            {current?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {current?.message && <div className="text-sm text-fg-muted">{current.message}</div>}
    </Dialog>
  )
}
