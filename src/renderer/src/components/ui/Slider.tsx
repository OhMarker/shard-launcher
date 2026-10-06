import { useId } from 'react'
import { cn } from '@/lib/cn'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Fires on pointer/keyboard release; use it to persist. */
  onCommit?: (value: number) => void
  disabled?: boolean
  label?: string
  format?: (value: number) => string
  /** Values to mark on the track, e.g. a recommended value or a warning threshold. */
  marks?: Array<{ value: number; label?: string; tone?: 'neutral' | 'warning' }>
  className?: string
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  disabled,
  label,
  format,
  marks,
  className
}: SliderProps) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={cn('w-full', className)}>
      {(label || format) && (
        <div className="mb-2 flex items-center justify-between text-sm">
          {label && (
            <label htmlFor={id} className="font-medium text-fg">
              {label}
            </label>
          )}
          {format && <span className="font-mono text-[13px] text-fg-muted tabular-nums">{format(value)}</span>}
        </div>
      )}
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent-rgb)/0.5)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {marks?.map((m) => {
          const mp = ((m.value - min) / (max - min)) * 100
          return (
            <div
              key={m.value}
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${mp}%` }}
            >
              <div className={cn('h-3 w-0.5 rounded-full', m.tone === 'warning' ? 'bg-warning/80' : 'bg-white/35')} />
              {m.label && (
                <div
                  className={cn(
                    'absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[10px]',
                    m.tone === 'warning' ? 'text-warning/80' : 'text-fg-subtle'
                  )}
                >
                  {m.label}
                </div>
              )}
            </div>
          )
        })}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
          className={cn(
            'absolute inset-0 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed',
            '[&::-webkit-slider-runnable-track]:h-6 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-webkit-slider-thumb]:mt-[3px] [&::-webkit-slider-thumb]:size-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-[#0b0f18] [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(0_0_0/0.5),0_0_0_4px_rgb(var(--accent-rgb)/0.15)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95'
          )}
        />
      </div>
    </div>
  )
}
