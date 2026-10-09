import { Coins, EyeOff, Gift, Plus, Search, Store, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ShardError } from '@shared/errors'
import { MAX_SALE_PERCENT, salePrice } from '@shared/online'
import { type AdminShopItem, type Cosmetic, type CosmeticsView, type ShopItem } from '@shared/types'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { Tooltip } from '@/components/ui/Tooltip'
import { confirm } from '@/components/ui/confirm'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { RarityBadge } from '@/components/cosmetics/RarityBadge'
import { SaleTag } from '@/components/cosmetics/SaleTag'
import { TypeIcon } from '@/components/cosmetics/TypeIcon'
import { MAX_PRICE, parsePrice, parseSalePercent } from './shop-utils'
import { useAdminShop, type AdminMutations } from './useAdmin'

type ShopFilter = 'all' | 'sale' | 'hidden' | 'bundles'

function ShopRow({
  item,
  cosmetic,
  previewUrl,
  byId,
  m,
  limited
}: {
  item: AdminShopItem
  cosmetic: Cosmetic | null
  previewUrl: string | null
  byId: ReadonlyMap<string, Cosmetic>
  m: AdminMutations
  /** Older API: no sales, hiding or sold counts. */
  limited: boolean
}) {
  const name = cosmetic?.name ?? item.id
  const [rawPrice, setRawPrice] = useState(String(item.basePrice))
  const [rawSale, setRawSale] = useState(String(item.salePercent))
  const base = parsePrice(rawPrice)
  const pct = parseSalePercent(rawSale)
  const priceChanged = base !== null && base !== item.basePrice
  const saleChanged = pct !== null && pct !== item.salePercent
  const final = base !== null && pct !== null ? salePrice(base, pct) : null
  const saving =
    (m.price.isPending && m.price.variables?.id === item.id) ||
    (m.shopUpdate.isPending && m.shopUpdate.variables?.id === item.id && m.shopUpdate.variables.salePercent !== undefined)
  const hiding = m.shopUpdate.isPending && m.shopUpdate.variables?.id === item.id && m.shopUpdate.variables.hidden !== undefined

  const save = (): void => {
    if (priceChanged && base !== null) m.price.mutate({ id: item.id, price: base })
    if (saleChanged && pct !== null) m.shopUpdate.mutate({ id: item.id, salePercent: pct })
  }

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: `Stop selling ${name}?`,
      message: 'Players who own it keep it. Nobody can buy it until you add it back. To pause it for a while, hide it instead.',
      confirmLabel: 'Remove from shop',
      danger: true
    })
    if (ok) m.price.mutate({ id: item.id, price: null })
  }

  return (
    <li className={cn('grid grid-cols-[minmax(0,1fr)_128px_150px_88px_64px_32px] items-center gap-3 px-4 py-3', item.hidden && 'bg-white/2')}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          {cosmetic ? (
            <CosmeticTile
              cosmetic={cosmetic}
              previewUrl={previewUrl}
              className={cn('size-12 rounded-[10px]', item.hidden && 'opacity-50 grayscale')}
              iconClassName="size-5"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-[10px] bg-white/6 text-fg-subtle">
              <Gift className="size-5" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm font-medium', item.hidden ? 'text-fg-muted' : 'text-fg')}>{name}</span>
            {cosmetic && <RarityBadge rarity={cosmetic.rarity} />}
            {item.hidden && (
              <Badge size="sm" tone="outline" icon={<EyeOff />}>
                Hidden
              </Badge>
            )}
          </div>
          <div className="truncate font-mono text-[10.5px] text-fg-subtle">{item.id}</div>
          {item.items && item.items.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.items.map((id) => {
                const c = byId.get(id)
                return (
                  <Badge key={id} size="sm" tone="neutral" icon={c ? <TypeIcon type={c.type} /> : <Gift />}>
                    {c?.name ?? id}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Input
        size="sm"
        type="number"
        min={0}
        max={MAX_PRICE}
        step={1}
        leftIcon={<Coins />}
        aria-label={`Base price of ${name}`}
        value={rawPrice}
        onChange={(e) => setRawPrice(e.target.value)}
        error={base === null ? '0 to 1,000,000' : null}
      />

      <div className="flex items-center gap-2">
        <Input
          size="sm"
          type="number"
          min={0}
          max={MAX_SALE_PERCENT}
          step={5}
          aria-label={`Sale percent for ${name}`}
          value={rawSale}
          disabled={limited}
          onChange={(e) => setRawSale(e.target.value)}
          rightSlot={<span className="pr-1.5 text-xs text-fg-subtle">%</span>}
          error={pct === null ? '0 to 90' : null}
          className="w-[72px]"
        />
        <div className="min-w-0 leading-tight" aria-live="polite">
          {final !== null && pct !== null && pct > 0 ? (
            <>
              <div className="text-[13px] font-semibold tabular-nums text-fg">{final}</div>
              <div className="text-[10.5px] text-fg-subtle">
                <s>{base}</s> <SaleTag badge={`-${pct}%`} className="ml-0.5 h-3.5 px-1 text-[9.5px]" />
              </div>
            </>
          ) : (
            <div className="text-[11px] text-fg-subtle">No sale</div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="primary" disabled={!priceChanged && !saleChanged} loading={saving} onClick={save}>
          Save
        </Button>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <Tooltip content={limited ? 'This Shard API version cannot hide items' : item.hidden ? 'Hidden: not for sale, owners keep it' : 'Visible in the shop'}>
          <span className="inline-flex">
            <Switch
              size="sm"
              checked={!item.hidden}
              disabled={limited || hiding}
              onCheckedChange={(visible) => m.shopUpdate.mutate({ id: item.id, hidden: !visible })}
            />
          </span>
        </Tooltip>
        <span className="text-[10px] tabular-nums text-fg-subtle">{limited ? '—' : `${item.sold} sold`}</span>
      </div>

      <IconButton label={`Remove ${name} from the shop`} size="sm" variant="danger" onClick={() => void remove()}>
        <Trash2 />
      </IconButton>
    </li>
  )
}

export interface ShopSectionProps {
  /** The public shop (fallback when the API has no admin shop list yet). */
  shop: readonly ShopItem[]
  catalogue: CosmeticsView | undefined
  m: AdminMutations
}

/** Prices, sales, hiding, removal, and putting catalogue cosmetics up for sale. */
export function ShopSection({ shop, catalogue, m }: ShopSectionProps) {
  const adminShop = useAdminShop(true)
  const [filter, setFilter] = useState<ShopFilter>('all')
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c])), [catalogue])
  const names = useMemo(() => new Map([...byId.values()].map((c) => [c.id, c.name])), [byId])

  // An API from before sales answers 404 here: show the public shop with prices only.
  const limited = adminShop.isError && ShardError.from(adminShop.error).code === 'NOT_FOUND'
  const items: AdminShopItem[] | null = adminShop.data
    ? adminShop.data
    : limited
      ? shop.map((item) => ({ ...item, hidden: false, sold: 0 }))
      : null

  const counts = {
    all: items?.length ?? 0,
    sale: items?.filter((i) => i.salePercent > 0).length ?? 0,
    hidden: items?.filter((i) => i.hidden).length ?? 0,
    bundles: items?.filter((i) => i.id.startsWith('bundle-')).length ?? 0
  }
  const needle = query.trim().toLowerCase()
  const visible = (items ?? []).filter((i) => {
    if (filter === 'sale' && i.salePercent <= 0) return false
    if (filter === 'hidden' && !i.hidden) return false
    if (filter === 'bundles' && !i.id.startsWith('bundle-')) return false
    return needle === '' || i.id.includes(needle) || (names.get(i.id) ?? '').toLowerCase().includes(needle)
  })

  const unsold = [...names.keys()].filter((id) => !(items ?? []).some((item) => item.id === id))
  const [newId, setNewId] = useState('')
  const [newPrice, setNewPrice] = useState('1000')
  const addId = unsold.includes(newId) ? newId : (unsold[0] ?? '')
  const addPrice = parsePrice(newPrice)

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-fg">Shop</h2>
          <p className="text-xs text-fg-muted">
            Prices, sales and hiding apply to every player right away. Hidden items cannot be bought; owners keep them.
          </p>
        </div>
        <Input
          size="sm"
          leftIcon={<Search />}
          placeholder="Find an item"
          aria-label="Find a shop item"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-48"
        />
      </div>
      <div className="flex items-center gap-3 border-b border-line bg-white/2 px-4 py-2">
        <Tabs<ShopFilter>
          size="sm"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'sale', label: 'On sale', count: counts.sale },
            { value: 'hidden', label: 'Hidden', icon: <EyeOff />, count: counts.hidden },
            { value: 'bundles', label: 'Bundles', icon: <Gift />, count: counts.bundles }
          ]}
        />
        {limited && <span className="text-xs text-warning">This Shard API version has prices only (no sales or hiding).</span>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_128px_150px_88px_64px_32px] gap-3 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        <span>Item</span>
        <span>Base price</span>
        <span>Sale</span>
        <span />
        <span className="text-center">Shown</span>
        <span />
      </div>
      {!items && adminShop.isError ? (
        <ErrorCard className="m-4" error={adminShop.error} onRetry={() => void adminShop.refetch()} retrying={adminShop.isFetching} />
      ) : !items ? (
        <div className="space-y-3 px-4 py-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon={<Store />}
          title={items.length === 0 ? 'Nothing for sale' : 'Nothing here'}
          description={items.length === 0 ? 'Add a catalogue cosmetic below.' : 'No shop item matches this filter.'}
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((item) => (
            <ShopRow
              key={`${item.id}:${item.basePrice}:${item.salePercent}`}
              item={item}
              cosmetic={byId.get(item.id) ?? null}
              previewUrl={catalogue?.previews[item.id] ?? null}
              byId={byId}
              m={m}
              limited={limited}
            />
          ))}
        </ul>
      )}
      {unsold.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line bg-white/2 px-4 py-3">
          <span className="shrink-0 text-[13px] font-medium text-fg">Sell another item</span>
          <Select
            size="sm"
            value={addId}
            onChange={setNewId}
            options={unsold.map((id) => ({ value: id, label: names.get(id) ?? id }))}
            aria-label="Cosmetic to sell"
            className="flex-1"
          />
          <Input
            size="sm"
            type="number"
            min={0}
            max={MAX_PRICE}
            leftIcon={<Coins />}
            aria-label="Price"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="w-36"
          />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus />}
            disabled={!addId || addPrice === null}
            loading={m.price.isPending && m.price.variables?.id === addId}
            onClick={() => addPrice !== null && m.price.mutate({ id: addId, price: addPrice })}
          >
            Sell
          </Button>
        </div>
      )}
    </Card>
  )
}
