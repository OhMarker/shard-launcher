import { TriangleAlert } from 'lucide-react'
import { formatMemory } from '@shared/format'
import { cn } from '@/lib/cn'
import { Slider } from '@/components/ui/Slider'
import {
  FALLBACK_TOTAL_MEMORY_MB,
  MEMORY_STEP_MB,
  MIN_MEMORY_MB,
  maxMemoryMb,
  memoryWarningMb,
  recommendedMemoryMb
} from './instance-helpers'

export interface MemorySliderProps {
  value: number
  onChange: (value: number) => void
  /** Fires on release; persist here. */
  onCommit?: (value: number) => void
  totalMemoryMb: number | undefined
  label?: string
  disabled?: boolean
  className?: string
}

/**
 * RAM allocation slider shared by instance settings and the global Java defaults.
 * Marks the recommended value and warns past half of the machine's memory.
 */
export function MemorySlider({
  value,
  onChange,
  onCommit,
  totalMemoryMb,
  label = 'Memory',
  disabled,
  className
}: MemorySliderProps) {
  const total = totalMemoryMb ?? FALLBACK_TOTAL_MEMORY_MB
  const max = maxMemoryMb(total)
  const warning = memoryWarningMb(total)
  const recommended = recommendedMemoryMb(total)
  const overWarning = value > warning

  return (
    <div className={cn('space-y-1', className)}>
      <Slider
        value={Math.min(value, max)}
        min={MIN_MEMORY_MB}
        max={max}
        step={MEMORY_STEP_MB}
        onChange={onChange}
        onCommit={onCommit}
        disabled={disabled}
        label={label}
        format={formatMemory}
        marks={[
          { value: recommended, label: 'Recommended' },
          ...(warning > recommended && warning < max ? [{ value: warning, label: '50%', tone: 'warning' as const }] : [])
        ]}
      />
      <div className="flex min-h-5 items-center justify-between pt-4 text-xs">
        <span className="text-fg-subtle">
          {totalMemoryMb ? `${formatMemory(total)} installed` : 'Detecting system memory…'}
        </span>
        <span className={cn('flex items-center gap-1.5 transition-colors', overWarning ? 'text-warning' : 'text-transparent')} aria-live="polite">
          <TriangleAlert className={cn('size-3.5', !overWarning && 'invisible')} aria-hidden />
          {overWarning ? 'Allocating more than half of your RAM can hurt performance' : ' '}
        </span>
      </div>
    </div>
  )
}
