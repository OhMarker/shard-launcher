import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-white/6 px-1.5 font-mono text-[10.5px] text-fg-muted',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export function SectionHeader({
  title,
  description,
  action,
  className,
  size = 'md'
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2
          className={cn(
            'font-semibold tracking-tight text-fg',
            size === 'lg' && 'text-2xl',
            size === 'md' && 'text-base',
            size === 'sm' && 'text-[13px] uppercase tracking-wide text-fg-muted'
          )}
        >
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
  className
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 pt-1">{action}</div>}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  className
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-[12px] border border-line bg-white/4 px-3.5 py-3', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-fg-muted">{hint}</div>}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded-[5px] bg-white/8 px-1.5 py-0.5 font-mono text-[12px] text-fg">{children}</code>
}

/** Page content wrapper: consistent gutters and a scrollable body. */
export function PageBody({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('scroll-area h-full', className)}>
      <div className={cn('mx-auto w-full px-8 pb-10 pt-6', wide ? 'max-w-[1400px]' : 'max-w-[1100px]')}>{children}</div>
    </div>
  )
}
