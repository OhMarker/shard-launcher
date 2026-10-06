import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  strong?: boolean
  selected?: boolean
}

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, padding = 'md', strong, selected, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        strong ? 'glass-strong' : 'glass',
        'rounded-[var(--radius-lg)]',
        paddings[padding],
        interactive && 'hover-lift cursor-pointer hover:bg-white/6',
        selected && 'border-accent/50 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]',
        className
      )}
      {...rest}
    />
  )
})
