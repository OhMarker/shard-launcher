import { motion } from 'framer-motion'
import { ArrowRight, Check, CircleAlert, Coins, Gift, Sparkles, Ticket } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { normalizePromoCode, redeemErrorMessage } from '@shared/online'
import { type Cosmetic, type RedeemResult } from '@shared/types'
import { readyState, useOnlineState, useRedeemCode, useRefreshOnline } from '@/hooks/useOnline'
import { navigate, usePageHint } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { RarityBadge } from '@/components/cosmetics/RarityBadge'
import { OnlineEmptyState } from '@/components/online/OnlineNote'
import { TokenBalance } from './cosmetics/TokenBalance'
import { TYPE_LABELS } from './cosmetics/cosmetics-utils'
import { useCosmeticsView } from './cosmetics/useCosmetics'

interface Redeemed extends RedeemResult {
  code: string
  at: number
}

/** One granted item: its picture, name, type and rarity (or the bare id when the catalogue lacks it). */
function GrantedItem({ id, cosmetic, previewUrl }: { id: string; cosmetic: Cosmetic | null; previewUrl: string | null }) {
  return (
    <li className="flex items-center gap-3 rounded-[12px] border border-line bg-white/4 p-2 pr-3">
      {cosmetic ? (
        <CosmeticTile cosmetic={cosmetic} previewUrl={previewUrl} className="size-14 shrink-0 rounded-[9px]" iconClassName="size-6" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[9px] bg-white/6 text-fg-muted">
          <Gift className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{cosmetic?.name ?? id}</div>
        <div className="mt-1 flex items-center gap-1.5">
          {cosmetic && <RarityBadge rarity={cosmetic.rarity} />}
          <span className="text-[11px] text-fg-subtle">{cosmetic ? TYPE_LABELS[cosmetic.type] : 'Cosmetic'}</span>
        </div>
      </div>
      <Check className="size-4 shrink-0 text-success" aria-label="Now yours" />
    </li>
  )
}

function SuccessCard({ result, byId, previews }: { result: Redeemed; byId: ReadonlyMap<string, Cosmetic>; previews: Record<string, string> }) {
  const { tokens, items } = result.granted
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card padding="lg" className="relative overflow-hidden border-success/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-success/15 blur-3xl"
        />
        <div className="relative flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-success/15 text-success">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-fg">
              <span className="font-mono">{result.code}</span> redeemed
            </h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              {items.length > 0
                ? 'Everything below is yours now, on every computer you sign in on. Equip it on the Cosmetics page.'
                : 'The Shards are in your balance now.'}
            </p>
          </div>
        </div>
        <ul className="relative mt-4 grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2" aria-label="What the code gave">
          {tokens > 0 && (
            <li className="flex items-center gap-3 rounded-[12px] border border-warning/25 bg-warning/8 p-2 pr-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[9px] bg-warning/15 text-warning">
                <Coins className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tabular-nums text-fg">+{tokens} Shards</div>
                <div className="text-[11px] text-fg-muted">You now have {result.me.tokens} Shards.</div>
              </div>
            </li>
          )}
          {items.map((id) => (
            <GrantedItem key={id} id={id} cosmetic={byId.get(id) ?? null} previewUrl={previews[id] ?? null} />
          ))}
        </ul>
        {items.length > 0 && (
          <div className="relative mt-4">
            <Button size="sm" variant="secondary" rightIcon={<ArrowRight />} onClick={() => navigate('cosmetics')}>
              Open Cosmetics
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

/** Promo codes: type one, get tokens and cosmetics. */
export function CodesPage() {
  const onlineQuery = useOnlineState()
  const refreshOnline = useRefreshOnline()
  const online = readyState(onlineQuery.data)
  const redeem = useRedeemCode()
  const { data: catalogue } = useCosmeticsView()
  const [raw, setRaw] = useState('')
  const [history, setHistory] = useState<Redeemed[]>([])
  const [touched, setTouched] = useState(false)
  // The dev screenshot harness opens "codes/<CODE>" to show a redeemed code.
  const hint = usePageHint('codes')
  const autoRedeemed = useRef(false)

  const byId = useMemo(() => new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c])), [catalogue])
  const previews = catalogue?.previews ?? {}
  const code = normalizePromoCode(raw)

  const submit = (value: string): void => {
    const normalized = normalizePromoCode(value)
    setTouched(true)
    if (!normalized || redeem.isPending) return
    redeem.mutate(normalized, {
      onSuccess: (result) => {
        setHistory((h) => [{ ...result, code: normalized, at: Date.now() }, ...h.filter((r) => r.code !== normalized)])
        setRaw('')
        setTouched(false)
      }
    })
  }

  useEffect(() => {
    if (hint && online && !autoRedeemed.current) {
      autoRedeemed.current = true
      setRaw(hint)
      submit(hint)
    }
    // submit is stable enough for a one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, online])

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    submit(raw)
  }

  const formatError = touched && raw.trim() !== '' && !code ? 'Codes are 3 to 32 letters, numbers, - or _.' : null
  const apiError = redeem.isError ? redeemErrorMessage(redeem.error) : null
  const [latest, ...earlier] = history

  return (
    <PageBody>
      <PageHeader
        title="Codes"
        description="Got a promo code from Shard, a stream or an event? Redeem it here for Shards and cosmetics."
        action={online && <TokenBalance me={online.me} />}
      />

      <div className="mt-6 space-y-5">
        {onlineQuery.isLoading ? (
          <Card padding="lg">
            <Skeleton className="h-11 w-full" />
          </Card>
        ) : onlineQuery.data && onlineQuery.data.status !== 'ready' ? (
          <OnlineEmptyState
            state={onlineQuery.data}
            onRetry={() => refreshOnline.mutate()}
            retrying={refreshOnline.isPending}
            signedOutHint="Sign in with your Microsoft account to redeem codes."
          />
        ) : (
          <>
            <Card padding="lg" strong className="relative overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-accent/15 blur-3xl"
              />
              <form onSubmit={onSubmit} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
                    <Ticket className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-fg">Redeem a code</h2>
                    <p className="text-[13px] text-fg-muted">Each code works once per player. Capital letters do not matter.</p>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <Input
                    size="lg"
                    mono
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.target.value.toUpperCase())
                      if (redeem.isError) redeem.reset()
                    }}
                    onBlur={() => setTouched(true)}
                    placeholder="HALLOWEEN"
                    aria-label="Promo code"
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    data-autofocus
                    error={formatError}
                    className="flex-1 [&_input]:tracking-[0.12em]"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    variant="primary"
                    leftIcon={<Sparkles />}
                    loading={redeem.isPending}
                    disabled={!code}
                  >
                    Redeem
                  </Button>
                </div>
                {apiError && (
                  <div
                    role="alert"
                    className="mt-3 flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
                  >
                    <CircleAlert className="size-4 shrink-0" />
                    {apiError}
                  </div>
                )}
              </form>
            </Card>

            {latest && <SuccessCard key={latest.code + latest.at} result={latest} byId={byId} previews={previews} />}

            {earlier.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 text-[13px] font-medium text-fg">Redeemed earlier</div>
                <ul className="divide-y divide-line">
                  {earlier.map((r) => (
                    <li key={r.code + r.at} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-sm text-fg">{r.code}</span>
                      <span className="flex flex-1 flex-wrap gap-1">
                        {r.granted.tokens > 0 && (
                          <Badge size="sm" tone="warning" icon={<Coins />}>
                            +{r.granted.tokens}
                          </Badge>
                        )}
                        {r.granted.items.map((id) => (
                          <Badge key={id} size="sm" tone="neutral">
                            {byId.get(id)?.name ?? id}
                          </Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {!latest && (
              <p className="px-1 text-xs text-fg-subtle">
                Codes come from Shard staff and events. A code may expire, or run out after a number of uses.
              </p>
            )}
          </>
        )}
      </div>
    </PageBody>
  )
}
