import { ChevronDown } from 'lucide-react'
import { type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  disabled?: boolean
}

export interface SelectProps<V extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  value: V
  onChange: (value: V) => void
  options: ReadonlyArray<SelectOption<V>>
  size?: 'sm' | 'md'
  placeholder?: string
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  placeholder,
  className,
  disabled,
  ...rest
}: SelectProps<V>) {
  return (
    <div className={cn('relative inline-flex w-full', className)}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as V)}
        className={cn(
          'w-full cursor-pointer appearance-none rounded-[10px] border border-line bg-white/5 pl-3 pr-9 text-fg outline-none transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.15)] disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 text-[13px]' : 'h-9.5 text-sm',
          '[&>option]:bg-[#0b0f18] [&>option]:text-fg'
        )}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  )
}
