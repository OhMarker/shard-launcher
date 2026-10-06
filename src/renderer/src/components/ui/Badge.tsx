import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  icon?: ReactNode
  dot?: boolean
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-white/8 text-fg-muted border-white/5',
  accent: 'bg-accent/15 text-accent border-accent/25',
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger: 'bg-danger/15 text-danger border-danger/25',
  info: 'bg-info/15 text-info border-info/25',
  outline: 'bg-transparent text-fg-muted border-line-strong'
}

export function Badge({ tone = 'neutral', size = 'md', icon, dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        '[&_svg]:size-3',
        tones[tone],
        className
      )}
      {...rest}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {icon}
      {children}
    </span>
  )
}
