import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export type DropdownItem =
  | 'separator'
  | {
      label: ReactNode
      icon?: ReactNode
      onSelect: () => void
      danger?: boolean
      disabled?: boolean
      checked?: boolean
      hint?: ReactNode
    }
  | { header: ReactNode }

export interface DropdownProps {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void; 'aria-expanded'?: boolean; ref?: unknown }>
  items: DropdownItem[]
  align?: 'start' | 'end'
  side?: 'bottom' | 'top'
  width?: number
  className?: string
}

export function Dropdown({ trigger, items, align = 'end', side = 'bottom', width = 224, className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [active, setActive] = useState(-1)
  const id = useId()

  const selectable = items
    .map((item, index) => ({ item, index }))
    .filter((x) => typeof x.item === 'object' && 'onSelect' in x.item && !x.item.disabled)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'end' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, vw - width - 8))
    let top = side === 'bottom' ? r.bottom + 6 : r.top - menuH - 6
    if (side === 'bottom' && top + menuH > vh - 8) top = Math.max(8, r.top - menuH - 6)
    setPos({ top, left })
  }, [open, align, side, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        ;(triggerRef.current as HTMLElement | null)?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => {
          const n = selectable.length
          if (n === 0) return -1
          const cur = selectable.findIndex((s) => s.index === a)
          const next = e.key === 'ArrowDown' ? (cur + 1) % n : (cur - 1 + n) % n
          return selectable[next]!.index
        })
      } else if (e.key === 'Enter' || e.key === ' ') {
        const item = items[active]
        if (item && typeof item === 'object' && 'onSelect' in item) {
          e.preventDefault()
          item.onSelect()
          setOpen(false)
        }
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', () => setOpen(false), { once: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, items, active, selectable])

  // The callback ref below runs on commit, not during render; the lint rule cannot tell.
  // eslint-disable-next-line react-hooks/refs
  const triggerEl = cloneElement(trigger, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
    },
    'aria-expanded': open,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setActive(-1)
      setOpen((o) => !o)
    }
  } as never)

  return (
    <>
      {triggerEl}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              id={id}
              initial={{ opacity: 0, scale: 0.96, y: side === 'bottom' ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: side === 'bottom' ? -4 : 4 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
              className={cn(
                'glass-strong fixed z-[90] origin-top rounded-[12px] bg-[#0b0f18]/95 p-1.5 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)]',
                className
              )}
            >
              {items.map((item, index) => {
                if (item === 'separator') return <div key={index} className="my-1.5 h-px bg-line" />
                if ('header' in item)
                  return (
                    <div key={index} className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                      {item.header}
                    </div>
                  )
                return (
                  <button
                    key={index}
                    role="menuitem"
                    disabled={item.disabled}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      item.onSelect()
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
                      item.danger ? 'text-danger' : 'text-fg',
                      active === index && (item.danger ? 'bg-danger/15' : 'bg-white/8')
                    )}
                  >
                    {item.icon && <span className="text-fg-muted">{item.icon}</span>}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="text-xs text-fg-subtle">{item.hint}</span>}
                    {item.checked && <Check className="text-accent" />}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
