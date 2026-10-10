import { Activity, ArrowRight, Coins, Gamepad2, ShieldCheck, ShoppingBag, Store, Ticket, Users } from 'lucide-react'
import { type ReactNode } from 'react'
import { codeStatus, saleDisplay } from '@shared/online'
import { type AdminShopItem, type CosmeticsView, type PromoCode } from '@shared/types'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { SaleTag } from '@/components/cosmetics/SaleTag'
import { useAdminStats } from './useAdmin'

export type StaffTab = 'overview' | 'players' | 'shop' | 'packs' | 'codes' | 'roles'

const nf = new Intl.NumberFormat('en-US')

type Tone = 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral'

const TONES: Record<Tone, string> = {
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  neutral: 'bg-white/8 text-fg-muted'
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  live
}: {
  icon: ReactNode
  label: string
  value: number | null
  hint?: string
  tone: Tone
  live?: boolean
}) {
  return (
    <Card padding="md" className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
          {value === null ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className="mt-1 text-[26px] font-semibold leading-tight tabular-nums text-fg">{nf.format(value)}</div>
          )}
          {hint && <div className="mt-0.5 text-xs text-fg-muted">{hint}</div>}
        </div>
        <span className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-[18px]', TONES[tone])}>
          {icon}
          {live && value !== null && value > 0 && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-black/60 bg-success shadow-[0_0_8px_rgb(52_211_153/0.9)]" />
          )}
        </span>
      </div>
    </Card>
  )
}

export interface OverviewSectionProps {
  shop: readonly AdminShopItem[] | undefined
  codes: readonly PromoCode[] | undefined
  catalogue: CosmeticsView | undefined
  onOpen: (tab: StaffTab) => void
}

/** Numbers at a glance, best sellers and the codes that work right now. */
export function OverviewSection({ shop, codes, catalogue, onOpen }: OverviewSectionProps) {
  const statsQuery = useAdminStats(true)
  const s = statsQuery.data ?? null
  const now = useNow()
  const liveCodes = codes?.filter((c) => codeStatus(c, now) === 'active') ?? null
  const byId = new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c]))
  const best = [...(shop ?? [])].sort((a, b) => b.sold - a.sold).slice(0, 5)
  const onSale = (shop ?? []).filter((i) => i.salePercent > 0 && !i.hidden).length
  const hidden = (shop ?? []).filter((i) => i.hidden).length

  return (
    <div className="space-y-5">
      {statsQuery.isError ? (
        <ErrorCard error={statsQuery.error} onRetry={() => void statsQuery.refetch()} retrying={statsQuery.isFetching} />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={<Users />} label="Players" value={s?.players ?? null} hint="Signed in to Shard" tone="accent" />
          <StatCard icon={<Gamepad2 />} label="In game now" value={s?.inGameNow ?? null} hint="Last 5 minutes" tone="success" live />
          <StatCard icon={<Activity />} label="Active today" value={s?.activeToday ?? null} hint="Played in the last 24 hours" tone="info" />
          <StatCard icon={<Coins />} label="Shards held" value={s?.tokensHeld ?? null} hint="Across every player" tone="warning" />
          <StatCard icon={<ShoppingBag />} label="Purchases" value={s?.purchases ?? null} hint="Bought with Shards" tone="accent" />
          <StatCard icon={<Ticket />} label="Code redemptions" value={s?.codeRedemptions ?? null} hint="All rounds" tone="danger" />
          <StatCard icon={<ShieldCheck />} label="Staff" value={s?.staff ?? null} hint="Owners, admins and mods" tone="neutral" />
          <StatCard
            icon={<Ticket />}
            label="Live codes"
            value={liveCodes ? liveCodes.length : null}
            hint={codes ? `${codes.length} in total` : undefined}
            tone="success"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-fg">Best sellers</h3>
              <p className="text-xs text-fg-muted">
                {shop ? `${shop.length} in the shop · ${onSale} on sale · ${hidden} hidden` : 'Loading the shop'}
              </p>
            </div>
            <Button size="xs" variant="ghost" rightIcon={<ArrowRight />} onClick={() => onOpen('shop')}>
              Shop
            </Button>
          </div>
          {!shop ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : best.length === 0 ? (
            <EmptyState compact icon={<Store />} title="Nothing for sale" description="Add items on the Shop tab." />
          ) : (
            <ol className="divide-y divide-line">
              {best.map((item, i) => {
                const cosmetic = byId.get(item.id)
                const sale = saleDisplay(item)
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-4 text-xs font-semibold tabular-nums text-fg-subtle">{i + 1}</span>
                    {cosmetic ? (
                      <CosmeticTile
                        cosmetic={cosmetic}
                        previewUrl={catalogue?.previews[item.id] ?? null}
                        className="size-9 shrink-0 rounded-[8px]"
                        iconClassName="size-4"
                      />
                    ) : (
                      <span className="size-9 shrink-0 rounded-[8px] bg-white/6" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg">{cosmetic?.name ?? item.id}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                        <Coins className="size-3" />
                        {sale.was !== null && <s>{sale.was}</s>}
                        {item.price}
                        {sale.badge && <SaleTag badge={sale.badge} className="h-4 px-1.5 text-[10px]" />}
                        {item.hidden && (
                          <Badge size="sm" tone="outline">
                            Hidden
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-fg">{nf.format(item.sold)}</span>
                    <span className="text-[11px] text-fg-subtle">sold</span>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-fg">Live codes</h3>
              <p className="text-xs text-fg-muted">Codes players can redeem right now.</p>
            </div>
            <Button size="xs" variant="ghost" rightIcon={<ArrowRight />} onClick={() => onOpen('codes')}>
              Codes
            </Button>
          </div>
          {!liveCodes ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : liveCodes.length === 0 ? (
            <EmptyState compact icon={<Ticket />} title="No live codes" description="Create one on the Codes tab." />
          ) : (
            <ul className="divide-y divide-line">
              {liveCodes.slice(0, 6).map((c) => (
                <li key={c.code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-[13px] font-semibold tracking-wide text-fg">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {[c.tokens > 0 ? `${c.tokens} Shards` : null, ...c.items.map((id) => byId.get(id)?.name ?? id)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="text-xs tabular-nums text-fg-subtle">
                    {c.usesThisRound}
                    {c.maxUses !== null ? ` / ${c.maxUses}` : ''} uses
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
