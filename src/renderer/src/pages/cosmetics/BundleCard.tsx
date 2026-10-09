import { motion } from 'framer-motion'
import { Check, Circle, Coins, Gift, Lock } from 'lucide-react'
import { type BundleState } from '@shared/online'
import { type Cosmetic } from '@shared/types'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { BuyButton } from '@/components/cosmetics/BuyButton'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { RarityBadge } from '@/components/cosmetics/RarityBadge'
import { TypeIcon } from '@/components/cosmetics/TypeIcon'
import { TYPE_LABELS, bundleHeadline, bundleNote } from './cosmetics-utils'

export interface BundleCardProps {
  bundle: Cosmetic
  previewUrl: string | null
  /** Catalogue entries for the bundle's items (null when the catalogue does not list one). */
  itemsById: ReadonlyMap<string, Cosmetic>
  state: BundleState
  /** The player's balance; null when not signed in to the Shard API. */
  tokens: number | null
  onBuy: () => void
  buying: boolean
  onItemClick: (cosmetic: Cosmetic) => void
}

/** The featured card for a bundle such as the OhMarker set, above the wardrobe grid. */
export function BundleCard({
  bundle,
  previewUrl,
  itemsById,
  state,
  tokens,
  onBuy,
  buying,
  onItemClick
}: BundleCardProps) {
  const note = bundleNote(state)
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={`${bundle.name} bundle`}
      className={cn(
        'glass relative grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)]',
        state.complete
          ? 'border-accent/50'
          : 'border-[rgb(var(--accent-rgb)/0.35)] shadow-[0_0_32px_-12px_rgb(var(--accent-rgb)/0.7)]'
      )}
    >
      {/* The set picture is 16:9; show it whole rather than cropped to one item. */}
      <div className="relative flex items-center overflow-hidden bg-black/40">
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-2xl"
          />
        )}
        <CosmeticTile
          cosmetic={bundle}
          previewUrl={previewUrl}
          className="relative aspect-video w-full"
          iconClassName="size-14"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent" icon={<Gift />}>
            Set
          </Badge>
          <RarityBadge rarity={bundle.rarity} />
          {state.complete && (
            <Badge tone="success" icon={<Check />}>
              Owned
            </Badge>
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-fg">{bundleHeadline(bundle.name, state)}</h3>
          {bundle.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{bundle.description}</p>
          )}
        </div>
        <ul className="grid gap-1" aria-label="In this set">
          {state.items.map((item) => {
            const cosmetic = itemsById.get(item.id) ?? null
            const name = cosmetic?.name ?? item.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!cosmetic}
                  onClick={() => cosmetic && onItemClick(cosmetic)}
                  aria-label={`${name}${item.owned ? ', owned' : ''}`}
                  className="flex h-8 w-full items-center gap-2 rounded-[8px] border border-line bg-white/4 px-2.5 text-left transition-colors hover:border-line-strong disabled:cursor-default"
                >
                  {cosmetic ? (
                    <TypeIcon type={cosmetic.type} className="size-4 shrink-0 text-fg-muted" />
                  ) : (
                    <Gift className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{name}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">
                    {item.owned
                      ? 'Owned'
                      : item.price !== null
                        ? `${item.price} alone`
                        : cosmetic
                          ? TYPE_LABELS[cosmetic.type]
                          : ''}
                  </span>
                  {item.owned ? (
                    <Check className="size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Circle className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-3">
          {state.complete ? (
            <Button size="sm" variant="secondary" disabled leftIcon={<Check />}>
              Owned
            </Button>
          ) : state.price !== null && tokens !== null ? (
            <BuyButton
              size="sm"
              offer={{ price: state.price, tokens }}
              onBuy={onBuy}
              loading={buying}
            />
          ) : state.price !== null ? (
            <Tooltip content="Sign in to Shard to buy with tokens">
              <span className="inline-flex">
                <Button size="sm" variant="outline" disabled leftIcon={<Coins />}>
                  {state.price} tokens
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button size="sm" variant="outline" disabled leftIcon={<Lock />}>
              Not on sale
            </Button>
          )}
          {note && <span className="text-xs text-fg-subtle">{note}</span>}
        </div>
      </div>
    </motion.section>
  )
}
