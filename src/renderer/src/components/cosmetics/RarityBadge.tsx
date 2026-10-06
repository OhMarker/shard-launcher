import { type CosmeticRarity } from '@shared/types'
import { cn } from '@/lib/cn'
import { RARITY_PALETTE } from '@/pages/cosmetics/cosmetics-utils'

export interface RarityBadgeProps {
  rarity: CosmeticRarity
  size?: 'sm' | 'md'
  className?: string
}

/** Pill in the rarity's colour; mythic gets a glow. */
export function RarityBadge({ rarity, size = 'sm', className }: RarityBadgeProps) {
  const style = RARITY_PALETTE[rarity]
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border font-semibold leading-none',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        className
      )}
      style={{
        color: style.color,
        background: style.soft,
        borderColor: style.border,
        boxShadow: style.glow ?? undefined
      }}
    >
      {style.label}
    </span>
  )
}
