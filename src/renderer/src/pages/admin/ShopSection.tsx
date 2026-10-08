import { Coins, Plus, Store, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { type ShopItem } from '@shared/types'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { confirm } from '@/components/ui/confirm'
import { type AdminMutations } from './useAdmin'

const MAX_PRICE = 1_000_000

/** A whole number from 0 to 1,000,000, or null. */
function parsePrice(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRICE ? n : null
}

function PriceRow({ item, name, m }: { item: ShopItem; name: string; m: AdminMutations }) {
  const [raw, setRaw] = useState(String(item.price))
  const price = parsePrice(raw)
  const changed = price !== null && price !== item.price
  const saving = m.price.isPending && m.price.variables?.id === item.id

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: `Stop selling ${name}?`,
      message: 'Players who own it keep it. Nobody can buy it until you add it back.',
      confirmLabel: 'Remove from shop',
      danger: true
    })
    if (ok) m.price.mutate({ id: item.id, price: null })
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{name}</div>
        <div className="truncate font-mono text-[11px] text-fg-subtle">{item.id}</div>
      </div>
      <Input
        size="sm"
        type="number"
        min={0}
        max={MAX_PRICE}
        step={1}
        leftIcon={<Coins />}
        aria-label={`Price of ${name}`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        error={price === null ? '0 to 1,000,000' : null}
        className="w-36"
      />
      <Button
        size="sm"
        variant="primary"
        disabled={!changed}
        loading={saving && m.price.variables?.price !== null}
        onClick={() => price !== null && m.price.mutate({ id: item.id, price })}
      >
        Save
      </Button>
      <IconButton label={`Remove ${name} from the shop`} size="sm" variant="danger" onClick={() => void remove()}>
        <Trash2 />
      </IconButton>
    </li>
  )
}

export interface ShopSectionProps {
  shop: readonly ShopItem[]
  /** Catalogue id -> display name. */
  names: ReadonlyMap<string, string>
  m: AdminMutations
}

/** Prices, removal, and putting catalogue cosmetics up for sale. */
export function ShopSection({ shop, names, m }: ShopSectionProps) {
  const unsold = [...names.keys()].filter((id) => !shop.some((item) => item.id === id))
  const [newId, setNewId] = useState('')
  const [newPrice, setNewPrice] = useState('1000')
  const addId = newId || unsold[0] || ''
  const addPrice = parsePrice(newPrice)

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-base font-semibold tracking-tight text-fg">Shop</h2>
        <p className="text-xs text-fg-muted">Prices apply to every player right away. Admins own everything for free.</p>
      </div>
      {shop.length === 0 ? (
        <EmptyState compact icon={<Store />} title="Nothing for sale" description="Add a catalogue cosmetic below." />
      ) : (
        <ul className="divide-y divide-line">
          {shop.map((item) => (
            <PriceRow key={`${item.id}:${item.price}`} item={item} name={names.get(item.id) ?? item.id} m={m} />
          ))}
        </ul>
      )}
      {unsold.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line bg-white/2 px-4 py-3">
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
