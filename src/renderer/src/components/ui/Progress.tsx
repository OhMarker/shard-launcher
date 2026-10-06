import { cn } from '@/lib/cn'

export interface ProgressProps {
  /** 0..100, or null for indeterminate. */
  value: number | null
  size?: 'xs' | 'sm' | 'md'
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  striped?: boolean
  className?: string
  label?: string
}

const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' }
const tones = {
  accent: 'bg-accent shadow-[0_0_12px_rgb(var(--accent-rgb)/0.6)]',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
}

export function Progress({ value, size = 'sm', tone = 'accent', striped, className, label }: ProgressProps) {
  const clamped = value === null ? null : Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      className={cn('relative w-full overflow-hidden rounded-full bg-white/8', heights[size], className)}
    >
      {clamped === null ? (
        <div
          className={cn('absolute inset-y-0 w-1/3 rounded-full', tones[tone])}
          style={{ animation: 'indeterminate 1.4s var(--ease-out-quint) infinite' }}
        />
      ) : (
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-quint)]',
            tones[tone],
            striped &&
              'bg-[linear-gradient(45deg,rgb(255_255_255/0.18)_25%,transparent_25%,transparent_50%,rgb(255_255_255/0.18)_50%,rgb(255_255_255/0.18)_75%,transparent_75%,transparent)] bg-[size:28px_28px] animate-[progress-stripes_0.8s_linear_infinite]'
          )}
          style={{ width: `${clamped}%` }}
        />
      )}
      <style>{`@keyframes indeterminate { 0% { left: -35%; } 100% { left: 100%; } }`}</style>
    </div>
  )
}

export interface RingProgressProps {
  value: number | null
  size?: number
  stroke?: number
  className?: string
}

export function RingProgress({ value, size = 36, stroke = 3, className }: RingProgressProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value === null ? 25 : Math.max(0, Math.min(100, value))
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(value === null && 'animate-[spin_1.2s_linear_infinite]', className)}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * v) / 100}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 300ms var(--ease-out-quint)' }}
      />
    </svg>
  )
}
