import { AnimatePresence, motion } from 'framer-motion'
import { cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export interface TooltipProps {
  content: ReactNode
  children: ReactElement<Record<string, unknown>>
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayMs?: number
  className?: string
}

export function Tooltip({ content, children, side = 'top', delayMs = 350, className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const gap = 8
      const map = {
        top: { top: r.top - gap, left: r.left + r.width / 2 },
        bottom: { top: r.bottom + gap, left: r.left + r.width / 2 },
        left: { top: r.top + r.height / 2, left: r.left - gap },
        right: { top: r.top + r.height / 2, left: r.right + gap }
      }
      setPos(map[side])
      setOpen(true)
    }, delayMs)
  }
  const hide = (): void => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // The callback ref below runs on commit, not during render; the lint rule cannot tell.
  // eslint-disable-next-line react-hooks/refs
  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      anchor.current = node
    },
    onMouseEnter: (e: React.MouseEvent) => {
      ;(children.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      ;(children.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      ;(children.props.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      ;(children.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
      hide()
    }
  } as never)

  const transform = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)'
  }[side]

  return (
    <>
      {child}
      {createPortal(
        <AnimatePresence>
          {open && pos && content && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ top: pos.top, left: pos.left, transform }}
              className={cn(
                'pointer-events-none fixed z-[120] max-w-xs rounded-[8px] border border-line-strong bg-[#0f1420] px-2.5 py-1.5 text-xs text-fg shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)]',
                className
              )}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
