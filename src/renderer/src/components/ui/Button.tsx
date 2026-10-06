import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-[0_8px_24px_-8px_rgb(var(--accent-rgb)/0.7)] hover:shadow-[0_10px_30px_-8px_rgb(var(--accent-rgb)/0.85)] font-semibold',
  secondary:
    'bg-white/8 text-fg hover:bg-white/12 active:bg-white/10 border border-line hover:border-line-strong',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-white/6 active:bg-white/8',
  outline: 'bg-transparent text-fg border border-line-strong hover:bg-white/6 active:bg-white/8',
  danger:
    'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 active:bg-danger/20 font-medium'
}

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-[8px]',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[9px]',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-[12px]',
  xl: 'h-14 px-7 text-base gap-2.5 rounded-[14px]'
}

const iconSizes: Record<ButtonSize, string> = {
  xs: '[&_svg]:size-3.5',
  sm: '[&_svg]:size-4',
  md: '[&_svg]:size-4',
  lg: '[&_svg]:size-[18px]',
  xl: '[&_svg]:size-5'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, leftIcon, rightIcon, fullWidth, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'press relative inline-flex select-none items-center justify-center whitespace-nowrap transition-[background-color,border-color,box-shadow,color,opacity] duration-200 ease-[var(--ease-out-quint)] disabled:opacity-50 disabled:shadow-none',
        variants[variant],
        sizes[size],
        iconSizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="animate-[spin_0.9s_linear_infinite]" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary'
  active?: boolean
}

const iconButtonSizes = {
  xs: 'size-7 rounded-[8px] [&_svg]:size-3.5',
  sm: 'size-8 rounded-[9px] [&_svg]:size-4',
  md: 'size-9 rounded-[10px] [&_svg]:size-[18px]',
  lg: 'size-11 rounded-[12px] [&_svg]:size-5'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', active, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'press inline-flex items-center justify-center transition-colors duration-150 disabled:opacity-40',
        variant === 'ghost' && 'text-fg-muted hover:bg-white/8 hover:text-fg',
        variant === 'secondary' && 'border border-line bg-white/6 text-fg hover:bg-white/10',
        variant === 'danger' && 'text-fg-muted hover:bg-danger/15 hover:text-danger',
        variant === 'primary' && 'bg-accent text-accent-fg hover:bg-accent-hover',
        active && 'bg-white/10 text-fg',
        iconButtonSizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
