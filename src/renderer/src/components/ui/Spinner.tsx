import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <LoaderCircle
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn('animate-[spin_0.9s_linear_infinite] text-fg-muted', className)}
    />
  )
}
