import { motion } from 'framer-motion'
import { Check, Lock, Plus, Sparkles } from 'lucide-react'
import { type Cosmetic } from '@shared/types'
import { cn } from '@/lib/cn'
import { RARITY_PALETTE, TYPE_LABELS } from '@/pages/cosmetics/cosmetics-utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { CosmeticTile } from './CosmeticTile'
import { RarityBadge } from './RarityBadge'
import { TypeIcon } from './TypeIcon'

export interface CosmeticCardProps {
  cosmetic: Cosmetic
  previewUrl: string | null
  owned: boolean
  /** Equipped in its slot, or on the emote wheel. */
  equipped: boolean
  /** Sticky-selected for the 3D preview. */
  selected: boolean
  pending: boolean
  onClick: () => void
  onHoverChange: (hovering: boolean) => void
  /** Equip/unequip, or add/remove from the emote wheel. */
  onPrimary: () => void
}

export function CosmeticCard({
  cosmetic,
  previewUrl,
  owned,
  equipped,
  selected,
  pending,
  onClick,
  onHoverChange,
  onPrimary
}: CosmeticCardProps) {
  const locked = !owned
  const isEmote = cosmetic.type === 'emote'
  const primaryLabel = isEmote
    ? equipped
      ? 'Remove from wheel'
      : 'Add to emote wheel'
    : equipped
      ? 'Unequip'
      : 'Equip'
  const stateText = locked ? ', locked' : equipped ? ', equipped' : owned ? ', owned' : ''

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className="h-full"
    >
      <div
        className={cn(
          'glass group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out-quint)] hover:-translate-y-0.5',
          equipped
            ? 'border-accent/60 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.4),0_0_28px_-8px_rgb(var(--accent-rgb)/0.6)]'
            : selected
              ? 'border-line-strong'
              : 'hover:border-line-strong',
          locked && 'opacity-70'
        )}
      >
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected || undefined}
          aria-label={`${cosmetic.name}, ${TYPE_LABELS[cosmetic.type]}, ${RARITY_PALETTE[cosmetic.rarity].label}${stateText}`}
          className="relative block w-full text-left"
        >
          <CosmeticTile
            cosmetic={cosmetic}
            previewUrl={previewUrl}
            className={cn('aspect-[4/5] w-full', locked && 'grayscale-[0.5]')}
          />
          <div className="absolute left-2 top-2">
            <RarityBadge rarity={cosmetic.rarity} />
          </div>
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {equipped && (
              <span
                className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_0_12px_rgb(var(--accent-rgb)/0.8)]"
                aria-hidden
              >
                <Check className="size-3.5" />
              </span>
            )}
            {locked && (
              <span
                className="flex size-6 items-center justify-center rounded-full bg-black/55 text-fg-muted"
                aria-hidden
              >
                <Lock className="size-3.5" />
              </span>
            )}
          </div>
          {cosmetic.description && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent p-2.5 pt-8 text-xs leading-snug text-fg opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
              {cosmetic.description}
            </div>
          )}
        </button>

        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <div className="truncate text-sm font-medium text-fg">{cosmetic.name}</div>
          <div className="flex flex-wrap items-center gap-1">
            <Badge size="sm" tone="neutral" icon={<TypeIcon type={cosmetic.type} />}>
              {TYPE_LABELS[cosmetic.type]}
            </Badge>
            {cosmetic.animated && (
              <Badge size="sm" tone="info" icon={<Sparkles />}>
                Animated
              </Badge>
            )}
            {owned && !equipped && (
              <Badge size="sm" tone="success">
                Owned
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-fg-subtle">by {cosmetic.author}</div>
          <div className="mt-auto pt-1">
            {locked ? (
              <Tooltip content="Not unlocked yet">
                <span className="inline-flex w-full">
                  <Button size="xs" variant="outline" fullWidth disabled leftIcon={<Lock />}>
                    Locked
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                size="xs"
                variant={equipped ? 'secondary' : 'outline'}
                fullWidth
                loading={pending}
                leftIcon={equipped ? <Check /> : isEmote ? <Plus /> : undefined}
                onClick={onPrimary}
              >
                {primaryLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
