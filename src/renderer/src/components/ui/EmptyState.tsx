import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-[16px] border border-line bg-white/4 text-fg-muted [&_svg]:text-accent/80',
            compact ? 'size-11 [&_svg]:size-5' : 'size-14 [&_svg]:size-6'
          )}
        >
          {icon}
        </div>
      )}
      <div className={cn('font-semibold text-fg', compact ? 'text-sm' : 'text-base')}>{title}</div>
      {description && (
        <div className={cn('max-w-sm text-fg-muted', compact ? 'text-xs' : 'text-sm')}>{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
