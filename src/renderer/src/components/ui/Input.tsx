import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  error?: string | null
  size?: 'sm' | 'md' | 'lg'
  mono?: boolean
}

const sizes = { sm: 'h-8 text-[13px] rounded-[9px]', md: 'h-9.5 text-sm rounded-[10px]', lg: 'h-11 text-[15px] rounded-[12px]' }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leftIcon, rightSlot, error, size = 'md', mono, className, ...rest },
  ref
) {
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'group relative flex items-center border bg-white/5 transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-accent/60 focus-within:bg-white/7 focus-within:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.15)] hover:border-line-strong',
          sizes[size],
          error ? 'border-danger/60' : 'border-line'
        )}
      >
        {leftIcon && <span className="pointer-events-none pl-3 text-fg-subtle [&_svg]:size-4">{leftIcon}</span>}
        <input
          ref={ref}
          className={cn(
            'h-full w-full min-w-0 flex-1 bg-transparent px-3 text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50',
            leftIcon && 'pl-2',
            rightSlot && 'pr-1',
            mono && 'font-mono text-[13px]'
          )}
          {...rest}
        />
        {rightSlot && <span className="flex items-center pr-1.5">{rightSlot}</span>}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | null
  mono?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, mono, className, ...rest },
  ref
) {
  return (
    <div className={cn('w-full', className)}>
      <textarea
        ref={ref}
        className={cn(
          'min-h-20 w-full resize-y rounded-[10px] border bg-white/5 px-3 py-2 text-sm text-fg outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-fg-subtle hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.15)] disabled:opacity-50',
          mono && 'font-mono text-[13px]',
          error ? 'border-danger/60' : 'border-line'
        )}
        {...rest}
      />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
})

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="text-[13px] font-medium text-fg">{label}</div>
      {children}
      {hint && <div className="text-xs text-fg-subtle">{hint}</div>}
    </div>
  )
}
