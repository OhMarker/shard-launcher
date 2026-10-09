import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Search, Sparkles } from 'lucide-react'
import { usePageHint } from '@/stores/ui'
import { type ReactNode, useMemo, useState } from 'react'
import {
  COSMETIC_RARITIES,
  type Cosmetic,
  type CosmeticRarity,
  type CosmeticsView
} from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { type BuyOffer } from '@/components/cosmetics/BuyButton'
import { CosmeticCard } from '@/components/cosmetics/CosmeticCard'
import { ErrorCard } from '@/components/mods/ErrorCard'
import {
  DEFAULT_FILTERS,
  RARITY_PALETTE,
  SPECIAL_SECOND,
  TYPE_FILTERS,
  countByType,
  featuredBundles,
  filterCosmetics,
  isEquippedIn,
  isOwned,
  toggleRarity,
  typeFilterLabel,
  type TypeFilter,
  type WardrobeFilters
} from './cosmetics-utils'

export interface WardrobeProps {
  view: CosmeticsView | undefined
  /** Owned ids: the Shard API's answer when signed in, otherwise the catalogue's. */
  owned: readonly string[]
  offerFor: (cosmetic: Cosmetic) => BuyOffer | null
  onBuy: (cosmetic: Cosmetic) => void
  buyingId: string | null
  loading: boolean
  error: unknown
  onRetry: () => void
  retrying: boolean
  selectedId: string | null
  onHover: (cosmetic: Cosmetic | null) => void
  onCardClick: (cosmetic: Cosmetic) => void
  onPrimary: (cosmetic: Cosmetic) => void
  pendingId: string | null
  /** The featured card for a bundle, shown above the grid. */
  renderBundle: (bundle: Cosmetic) => ReactNode
}

const EMPTY_COSMETICS: readonly Cosmetic[] = []

function RarityChip({
  rarity,
  active,
  onClick
}: {
  rarity: CosmeticRarity
  active: boolean
  onClick: () => void
}) {
  const style = RARITY_PALETTE[rarity]
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'press flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        !active && 'border-line bg-white/4 text-fg-muted hover:border-line-strong hover:text-fg'
      )}
      style={
        active
          ? {
              color: style.color,
              background: style.gradient ?? style.soft,
              borderColor: style.border,
              boxShadow: style.glow ?? undefined
            }
          : undefined
      }
    >
      <span className="size-1.5 rounded-full" style={{ background: style.color }} aria-hidden />
      {style.label}
    </button>
  )
}

/** The Special tab's header: limited event items, in the special rarity's colours. */
function SpecialBanner() {
  const { color } = RARITY_PALETTE.special
  return (
    <div
      className="relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] border px-4 py-3"
      style={{
        borderColor: RARITY_PALETTE.special.border,
        background: `linear-gradient(100deg, ${color}26 0%, ${SPECIAL_SECOND}26 100%)`,
        boxShadow: RARITY_PALETTE.special.glow ?? undefined
      }}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${SPECIAL_SECOND})` }}
      >
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">Special items</div>
        <p className="text-xs text-fg-muted">
          Limited event cosmetics, like the Halloween set. They can leave the shop when the event ends; once bought,
          they stay yours.
        </p>
      </div>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass overflow-hidden rounded-[var(--radius-lg)]">
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Wardrobe({
  view,
  loading,
  error,
  onRetry,
  retrying,
  selectedId,
  onHover,
  onCardClick,
  onPrimary,
  pendingId,
  owned,
  offerFor,
  onBuy,
  buyingId,
  renderBundle
}: WardrobeProps) {
  // "cosmetics/special" (dev screenshot harness, or a link) opens on the Special tab.
  const hint = usePageHint('cosmetics')
  const [filters, setFilters] = useState<WardrobeFilters>(() =>
    hint === 'special' ? { ...DEFAULT_FILTERS, type: 'special' } : DEFAULT_FILTERS
  )
  const all = view?.manifest.cosmetics ?? EMPTY_COSMETICS
  const counts = useMemo(() => countByType(all), [all])
  const list = useMemo(() => filterCosmetics(all, filters, owned), [all, filters, owned])
  const bundles = useMemo(() => featuredBundles(all, filters, owned), [all, filters, owned])
  const equipped = view?.equipped

  // Only offer filters the catalogue can match: a type tab or rarity chip with nothing behind it
  // is noise. The rarity row disappears when every item shares one rarity.
  const typeItems: TabItem<TypeFilter>[] = TYPE_FILTERS.filter(
    (t) => t === 'all' || counts[t] > 0
  ).map((t) => ({
    value: t,
    label:
      t === 'special' ? (
        <span className="font-semibold" style={{ color: RARITY_PALETTE.special.color }}>
          {typeFilterLabel(t)}
        </span>
      ) : (
        typeFilterLabel(t)
      ),
    icon: t === 'special' ? <Sparkles style={{ color: SPECIAL_SECOND }} /> : undefined,
    count: counts[t]
  }))
  const rarities = useMemo(
    () => COSMETIC_RARITIES.filter((r) => all.some((c) => c.rarity === r)),
    [all]
  )

  const isEquipped = (c: Cosmetic): boolean =>
    equipped ? isEquippedIn(c, equipped.equipped, equipped.emotes) : false

  const filtered = filters !== DEFAULT_FILTERS
  const specialTab = filters.type === 'special'

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <div className="flex items-center gap-3">
          <Input
            leftIcon={<Search />}
            placeholder="Search cosmetics"
            aria-label="Search cosmetics"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            className="flex-1"
          />
          <Switch
            size="sm"
            checked={filters.ownedOnly}
            onCheckedChange={(ownedOnly) => setFilters((f) => ({ ...f, ownedOnly }))}
            label="Owned only"
            className="shrink-0 items-center gap-2"
          />
        </div>
        <div className="overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          <Tabs<TypeFilter>
            size="sm"
            value={filters.type}
            onChange={(type) => setFilters((f) => ({ ...f, type }))}
            items={typeItems}
          />
        </div>
        {rarities.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rarity">
            {rarities.map((r) => (
              <RarityChip
                key={r}
                rarity={r}
                active={filters.rarities.includes(r)}
                onClick={() => setFilters((f) => ({ ...f, rarities: toggleRarity(f.rarities, r) }))}
              />
            ))}
            {filters.rarities.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setFilters((f) => ({ ...f, rarities: [] }))}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </Card>

      {specialTab && !loading && !error && <SpecialBanner />}

      {loading ? (
        <GridSkeleton />
      ) : error ? (
        <ErrorCard
          error={error}
          onRetry={onRetry}
          retrying={retrying}
          offlineHint="The cosmetics catalogue needs a connection. Equipped items still load in-game."
        />
      ) : list.length === 0 && bundles.length === 0 ? (
        <div className="glass rounded-[var(--radius-lg)]">
          <EmptyState
            icon={<Sparkles />}
            title={all.length === 0 ? 'No cosmetics yet' : 'Nothing matches'}
            description={
              all.length === 0
                ? 'The catalogue is empty. Refresh to fetch the latest cosmetics.'
                : 'Try another search, type or rarity, or turn off "Owned only".'
            }
            action={
              filtered && (
                <Button size="sm" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Reset filters
                </Button>
              )
            }
          />
        </div>
      ) : (
        <LayoutGroup>
          {bundles.length > 0 && (
            <div className="mb-3 space-y-3">
              {bundles.map((b) => (
                <div key={b.id}>{renderBundle(b)}</div>
              ))}
            </div>
          )}
          <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
            <AnimatePresence initial={false}>
              {list.map((c) => (
                <CosmeticCard
                  key={c.id}
                  cosmetic={c}
                  previewUrl={view?.previews[c.id] ?? null}
                  owned={isOwned(c, owned)}
                  equipped={isEquipped(c)}
                  selected={selectedId === c.id}
                  pending={pendingId === c.id}
                  onClick={() => onCardClick(c)}
                  onHoverChange={(hovering) => onHover(hovering ? c : null)}
                  onPrimary={() => onPrimary(c)}
                  offer={offerFor(c)}
                  onBuy={() => onBuy(c)}
                  buying={buyingId === c.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      )}
    </div>
  )
}
