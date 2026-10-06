import { motion } from 'framer-motion'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<V extends string = string> {
  value: V
  label: ReactNode
  icon?: ReactNode
  count?: number
  disabled?: boolean
}

export interface TabsProps<V extends string = string> {
  value: V
  onChange: (value: V) => void
  items: ReadonlyArray<TabItem<V>>
  size?: 'sm' | 'md'
  variant?: 'segmented' | 'underline'
  className?: string
}

export function Tabs<V extends string = string>({
  value,
  onChange,
  items,
  size = 'md',
  variant = 'segmented',
  className
}: TabsProps<V>) {
  const layoutId = useId()
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const enabled = items.filter((i) => !i.disabled)
    const idx = enabled.findIndex((i) => i.value === value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = enabled[(idx + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
      if (next) onChange(next.value)
    }
  }

  if (variant === 'underline') {
    return (
      <div role="tablist" onKeyDown={onKeyDown} className={cn('flex gap-1 border-b border-line', className)}>
        {items.map((item) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-sm transition-colors disabled:opacity-40',
                active ? 'text-fg' : 'text-fg-muted hover:text-fg'
              )}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span className="rounded-full bg-white/8 px-1.5 text-[11px] text-fg-muted">{item.count}</span>
              )}
              {active && (
                <motion.div
                  layoutId={`${layoutId}-underline`}
                  className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn('inline-flex items-center gap-0.5 rounded-[12px] border border-line bg-white/4 p-1', className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative flex items-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium transition-colors disabled:opacity-40 [&_svg]:size-4',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            {active && (
              <motion.div
                layoutId={`${layoutId}-pill`}
                className="absolute inset-0 rounded-[9px] bg-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span className="rounded-full bg-white/10 px-1.5 text-[11px] tabular-nums">{item.count}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
