import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: ReactNode
  description?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function Switch({ checked, onCheckedChange, disabled, label, description, size = 'md', className }: SwitchProps) {
  const id = useId()
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const knob = size === 'sm' ? 'size-4 translate-x-0.5' : 'size-5 translate-x-0.5'
  const knobOn = size === 'sm' ? 'translate-x-[18px]' : 'translate-x-[22px]'

  const control = (
    <button
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 ease-[var(--ease-out-quint)] disabled:opacity-50',
        track,
        checked
          ? 'border-accent/60 bg-accent shadow-[0_0_14px_rgb(var(--accent-rgb)/0.45)]'
          : 'border-line-strong bg-white/10 hover:bg-white/14'
      )}
    >
      <span
        className={cn(
          'block rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.5)] transition-transform duration-200 ease-[var(--ease-spring)]',
          knob,
          checked && knobOn,
          checked && 'bg-accent-fg'
        )}
      />
    </button>
  )

  if (!label && !description) return <span className={className}>{control}</span>

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className={cn('min-w-0 flex-1 cursor-pointer', disabled && 'opacity-60')}>
        {label && <div className="text-sm font-medium text-fg">{label}</div>}
        {description && <div className="mt-0.5 text-[13px] leading-snug text-fg-muted">{description}</div>}
      </label>
      {control}
    </div>
  )
}
