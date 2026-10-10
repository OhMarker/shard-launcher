import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CircleAlert, CreditCard, ExternalLink, Gem, Loader2, Receipt, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { formatShards, formatUsd, purchaseStatusLabel, storeErrorMessage } from '@shared/online'
import { type StorePack, type StorePurchase } from '@shared/types'
import { readyState, useOnlineState, useRefreshOnline } from '@/hooks/useOnline'
import { invoke, openExternal, queryKeys } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useCheckout } from '@/stores/checkout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { OnlineEmptyState } from '@/components/online/OnlineNote'
import { TokenBalance } from './cosmetics/TokenBalance'

export const TERMS_URL = 'https://ohmarker.github.io/shard-launcher/terms/'

/** Bigger packs get a bigger gem; the sizes only decorate. */
const GEM_SIZES = ['size-7', 'size-8', 'size-9', 'size-10', 'size-11']

function PackCard({ pack, index, onBuy, buying, disabled }: { pack: StorePack; index: number; onBuy: () => void; buying: boolean; disabled: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Card
        padding="none"
        strong={pack.bestValue}
        className={cn('relative flex h-full flex-col overflow-hidden', pack.bestValue && 'border-accent/50 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.25)]')}
      >
        {pack.bestValue && (
          <div className="absolute inset-x-0 top-0 bg-accent py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-accent-fg">
            Best value
          </div>
        )}
        <div className={cn('flex flex-1 flex-col items-center px-4 pb-4 text-center', pack.bestValue ? 'pt-9' : 'pt-6')}>
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-6 size-28 -translate-x-1/2 rounded-full bg-accent/15 blur-2xl" />
          <span className="relative flex size-16 items-center justify-center rounded-[16px] bg-accent/12 text-accent">
            <Gem className={GEM_SIZES[Math.min(index, GEM_SIZES.length - 1)]} />
          </span>
          <div className="relative mt-3 text-[13px] font-medium text-fg-muted">{pack.name}</div>
          <div className="relative mt-0.5 text-2xl font-bold tabular-nums text-fg">{formatShards(pack.shards)}</div>
          <div className="relative text-xs text-fg-muted">Shards</div>
          <div className="relative mt-2 h-6">
            {pack.bonusPercent > 0 && (
              <Badge size="sm" tone="success" icon={<Sparkles />}>
                +{pack.bonusPercent}% bonus
              </Badge>
            )}
          </div>
          <Button
            className="relative mt-3"
            fullWidth
            variant={pack.bestValue ? 'primary' : 'secondary'}
            leftIcon={<CreditCard />}
            loading={buying}
            disabled={disabled}
            onClick={onBuy}
            aria-label={`Buy ${formatShards(pack.shards)} Shards for ${formatUsd(pack.priceCents)}`}
          >
            {formatUsd(pack.priceCents)}
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

function WaitingCard() {
  const { pending, checking, checkNow, stopWaiting } = useCheckout()
  if (!pending) return null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card padding="lg" strong className="relative overflow-hidden border-accent/40">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg">
              Finish paying in your browser: {formatShards(pack(pending).shards)} Shards for {formatUsd(pack(pending).priceCents)}
            </h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              The payment page is run by Stripe; Shard never sees your card. Your Shards appear here a few seconds after you pay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => openExternal(pending.url)}>
              Open payment page
            </Button>
            <Button size="sm" variant="primary" loading={checking} onClick={() => void checkNow()}>
              I paid, check now
            </Button>
            <Button size="sm" variant="ghost" onClick={stopWaiting}>
              Stop waiting
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

const pack = (p: { pack: StorePack }): StorePack => p.pack

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  refunded: 'warning',
  disputed: 'danger'
}

function History({ purchases }: { purchases: StorePurchase[] }) {
  if (purchases.length === 0) return null
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13px] font-medium text-fg">
        <Receipt className="size-4 text-fg-muted" /> Your purchases
      </div>
      <ul className="divide-y divide-line">
        {purchases.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="w-28 shrink-0 tabular-nums text-fg-muted">{new Date(p.createdAt).toLocaleDateString()}</span>
            <span className="flex-1 text-fg">
              {p.packName} pack · <span className="tabular-nums">{formatShards(p.shards)} Shards</span>
            </span>
            <span className="tabular-nums text-fg-muted">{formatUsd(p.priceCents)}</span>
            <Badge size="sm" tone={STATUS_TONE[p.status] ?? 'neutral'}>
              {purchaseStatusLabel(p.status)}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Store: buy Shards with real money (Stripe Checkout in the browser). */
export function StorePage() {
  const onlineQuery = useOnlineState()
  const refreshOnline = useRefreshOnline()
  const online = readyState(onlineQuery.data)
  const packsQuery = useQuery({ queryKey: queryKeys.storePacks, queryFn: () => invoke('store:packs'), staleTime: 60_000 })
  const purchasesQuery = useQuery({
    queryKey: queryKeys.storePurchases,
    queryFn: () => invoke('store:purchases'),
    enabled: !!online,
    staleTime: 30_000
  })
  const { pending, start } = useCheckout()
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const buy = (p: StorePack): void => {
    setError(null)
    setBuying(p.id)
    start(p)
      .catch((err: unknown) => setError(storeErrorMessage(err)))
      .finally(() => setBuying(null))
  }

  const open = packsQuery.data?.open ?? false
  const packs = packsQuery.data?.packs ?? []

  return (
    <PageBody>
      <PageHeader
        title="Store"
        description="Get Shards to unlock capes, shields and bandanas. Or earn them for free: 10 Shards for every 10 minutes you play."
        action={online && <TokenBalance me={online.me} />}
      />

      <div className="mt-6 space-y-5">
        {onlineQuery.isLoading || packsQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-64 rounded-[16px]" />
            ))}
          </div>
        ) : onlineQuery.data && onlineQuery.data.status !== 'ready' ? (
          <OnlineEmptyState
            state={onlineQuery.data}
            onRetry={() => refreshOnline.mutate()}
            retrying={refreshOnline.isPending}
            signedOutHint="Sign in with your Microsoft account to buy Shards."
          />
        ) : packsQuery.isError ? (
          <Card padding="lg" className="flex items-center gap-3 text-[13px] text-fg-muted">
            <CircleAlert className="size-5 text-warning" /> {storeErrorMessage(packsQuery.error)}
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void packsQuery.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <>
            {!open && (
              <Card padding="md" className="flex items-center gap-3 border-warning/30 text-[13px] text-fg-muted">
                <CircleAlert className="size-4 shrink-0 text-warning" />
                The Store opens soon. Until then you can earn Shards by playing and redeem codes on the Codes page.
              </Card>
            )}
            {open && packsQuery.data?.testMode && (
              <Card padding="md" className="flex items-center gap-3 border-info/30 text-[13px] text-fg-muted">
                <Badge tone="info">Test mode</Badge>
                No real money: pay with Stripe's test card 4242 4242 4242 4242, any future date and any CVC.
              </Card>
            )}
            <WaitingCard />
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                <CircleAlert className="size-4 shrink-0" /> {error}
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {packs.map((p, i) => (
                <PackCard key={p.id} pack={p} index={i} buying={buying === p.id} disabled={!open || !!pending || buying !== null} onBuy={() => buy(p)} />
              ))}
            </div>
            <History purchases={purchasesQuery.data ?? []} />
            <div className="flex items-start gap-2 px-1 text-xs leading-relaxed text-fg-subtle">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Payments are handled by Stripe in your browser; Shard never sees your card. Shards unlock visual-only cosmetics,
                have no cash value and cannot be traded or cashed out. Purchases are final except where the law says otherwise.
                If you are under 18, ask a parent or guardian before buying.{' '}
                <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => openExternal(TERMS_URL)}>
                  Terms of Sale and refunds
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </PageBody>
  )
}
