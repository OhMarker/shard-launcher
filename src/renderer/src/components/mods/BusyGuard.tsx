import { type ReactElement } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'

export interface BusyGuardProps {
  busy: boolean
  reason?: string
  /** A control that is rendered disabled while busy. */
  children: ReactElement
  className?: string
}

/**
 * Wraps a disabled control so its tooltip still shows: disabled buttons swallow pointer events,
 * so the focusable span carries the hover/focus handlers instead.
 */
export function BusyGuard({
  busy,
  reason = 'Close the game before changing mods',
  children,
  className
}: BusyGuardProps) {
  if (!busy) return children
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className={cn('inline-flex rounded-[10px]', className)}>
        {children}
      </span>
    </Tooltip>
  )
}
