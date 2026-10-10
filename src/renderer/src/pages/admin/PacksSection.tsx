import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, DollarSign, Gem, Plus, Receipt, Save } from 'lucide-react'
import { useState } from 'react'
import { formatShards, formatUsd, parseUsd } from '@shared/online'
import { type AdminPack } from '@shared/types'
import { errorMessage, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'

interface Draft {
  name: string
  price: string
  shards: string
  active: boolean
  bestValue: boolean
}

const toDraft = (p: AdminPack): Draft => ({
  name: p.name,
  price: formatUsd(p.priceCents),
  shards: String(p.shards),
  active: p.active,
  bestValue: p.bestValue
})

/** The pack a draft describes, or the first problem with it. */
function fromDraft(base: AdminPack, d: Draft): AdminPack | string {
  const priceCents = parseUsd(d.price)
  if (priceCents === null || priceCents < 50) return 'Price: $0.50 or more'
  const shards = Number(d.shards.replace(/,/g, ''))
  if (!Number.isInteger(shards) || shards < 1 || shards > 1_000_000) return 'Shards: 1 to 1,000,000'
  if (d.name.trim() === '' || d.name.trim().length > 40) return 'Name: 1 to 40 characters'
  return { ...base, name: d.name.trim(), priceCents, shards, active: d.active, bestValue: d.bestValue }
}

function PackRow({ pack, onSave, saving }: { pack: AdminPack; onSave: (p: AdminPack) => void; saving: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(pack))
  const parsed = fromDraft(pack, draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(pack))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setDraft((d) => ({ ...d, [k]: v }))
  return (
    <li className="grid grid-cols-[minmax(110px,1fr)_110px_120px_104px_132px_76px] items-center gap-3 px-4 py-3">
      <Input size="sm" value={draft.name} onChange={(e) => set('name', e.target.value)} aria-label={`Name of the ${pack.id} pack`} />
      <Input size="sm" value={draft.price} onChange={(e) => set('price', e.target.value)} aria-label={`Price of the ${pack.id} pack in dollars`} />
      <Input size="sm" value={draft.shards} onChange={(e) => set('shards', e.target.value)} aria-label={`Shards in the ${pack.id} pack`} />
      <Switch size="sm" checked={draft.active} onCheckedChange={(v) => set('active', v)} label="On sale" />
      <Switch size="sm" checked={draft.bestValue} onCheckedChange={(v) => set('bestValue', v)} label="Best value" />
      <Button
        size="xs"
        variant={changed ? 'primary' : 'secondary'}
        leftIcon={<Save />}
        disabled={!changed || typeof parsed === 'string'}
        loading={saving}
        onClick={() => typeof parsed !== 'string' && onSave(parsed)}
      >
        Save
      </Button>
      {changed && typeof parsed === 'string' && <p className="col-span-6 -mt-1 text-xs text-danger">{parsed}</p>}
    </li>
  )
}

/** Shard packs for real money: prices, Shards, on/off and the Best value tag. Owners and admins. */
export function PacksSection() {
  const qc = useQueryClient()
  const packsQuery = useQuery({ queryKey: queryKeys.adminPacks, queryFn: () => invoke('admin:packs'), staleTime: 10_000 })
  const save = useMutation({
    mutationFn: (pack: AdminPack) => invoke('admin:packSave', pack),
    onSuccess: (data, pack) => {
      qc.setQueryData(queryKeys.adminPacks, data)
      void qc.invalidateQueries({ queryKey: queryKeys.storePacks })
      toast({ kind: 'success', title: `Saved the ${pack.name} pack`, message: `${formatShards(pack.shards)} Shards for ${formatUsd(pack.priceCents)}${pack.active ? '' : ' (not on sale)'}.` })
    },
    onError: (err) => toast({ kind: 'error', title: 'Could not save the pack', message: errorMessage(err) })
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const onSave = (p: AdminPack): void => {
    setSavingId(p.id)
    save.mutate(p, { onSettled: () => setSavingId(null) })
  }
  const addPack = (): void => {
    const packs = packsQuery.data?.packs ?? []
    let n = packs.length + 1
    while (packs.some((p) => p.id === `pack-${n}`)) n++
    onSave({ id: `pack-${n}`, name: `New pack ${n}`, priceCents: 999, shards: 2500, active: false, bestValue: false, sort: packs.length + 1 })
  }

  if (packsQuery.isLoading) return <Skeleton className="h-64 w-full rounded-[16px]" />
  if (packsQuery.isError) {
    return (
      <Card padding="lg" className="flex items-center gap-3 text-[13px] text-fg-muted">
        <CircleAlert className="size-5 text-warning" /> {errorMessage(packsQuery.error)}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void packsQuery.refetch()}>
          Try again
        </Button>
      </Card>
    )
  }
  const data = packsQuery.data!
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card padding="md" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[11px] bg-success/15 text-success">
            <DollarSign className="size-5" />
          </span>
          <div>
            <div className="text-lg font-semibold tabular-nums text-fg">{formatUsd(data.revenueCents)}</div>
            <div className="text-[11px] text-fg-muted">Paid, before Stripe fees (refunds taken off)</div>
          </div>
        </Card>
        <Card padding="md" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/15 text-accent">
            <Receipt className="size-5" />
          </span>
          <div>
            <div className="text-lg font-semibold tabular-nums text-fg">{data.paidPurchases}</div>
            <div className="text-[11px] text-fg-muted">Paid purchases</div>
          </div>
        </Card>
        <Card padding="md" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[11px] bg-warning/15 text-warning">
            <Gem className="size-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-fg">{data.open ? 'Store is open' : 'Store is closed'}</div>
            <div className="text-[11px] text-fg-muted">{data.open ? 'Players can buy packs' : 'No payment key on the Shard API yet'}</div>
          </div>
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-[13px] font-medium text-fg">Shard packs</div>
            <p className="text-xs text-fg-muted">Prices are in US dollars. Changes show in every launcher within a minute.</p>
          </div>
          <Button size="xs" variant="secondary" leftIcon={<Plus />} loading={savingId?.startsWith('pack-') && save.isPending} onClick={addPack}>
            Add pack
          </Button>
        </div>
        <div className="grid grid-cols-[minmax(110px,1fr)_110px_120px_104px_132px_76px] gap-3 border-b border-line px-4 py-2 text-[11px] uppercase tracking-wide text-fg-subtle">
          <span>Name</span>
          <span>Price</span>
          <span>Shards</span>
          <span />
          <span />
          <span />
        </div>
        <ul className="divide-y divide-line">
          {data.packs.map((p) => (
            // Keyed on the saved values, so a row starts over from the server's copy after a save.
            <PackRow key={JSON.stringify(p)} pack={p} onSave={onSave} saving={savingId === p.id && save.isPending} />
          ))}
        </ul>
      </Card>
      <p className="flex items-center gap-2 px-1 text-xs text-fg-subtle">
        <Badge size="sm" tone="neutral">Tip</Badge> Turning a pack off hides it from the Store; people who already bought it keep their Shards.
      </p>
    </div>
  )
}
