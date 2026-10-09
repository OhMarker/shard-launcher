import { Cloud, CloudOff, Package, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatRelative } from '@shared/format'
import { bundleState, effectiveOwned } from '@shared/online'
import { type Cosmetic, type CosmeticsView, type ShopItem } from '@shared/types'
import { useActiveAccount } from '@/hooks/useAccounts'
import { readyState, useOnlineState, useRefreshOnline } from '@/hooks/useOnline'
import { useTexture } from '@/hooks/useTexture'
import { toast } from '@/stores/ui'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Tooltip } from '@/components/ui/Tooltip'
import { confirm } from '@/components/ui/confirm'
import { type BuyOffer } from '@/components/cosmetics/BuyButton'
import { OnlineNote } from '@/components/online/OnlineNote'
import { BundleCard } from './cosmetics/BundleCard'
import { CosmeticDetailDialog } from './cosmetics/CosmeticDetailDialog'
import { CosmeticPreviewCard, type PreviewState } from './cosmetics/CosmeticPreviewCard'
import { TokenBalance } from './cosmetics/TokenBalance'
import { Wardrobe } from './cosmetics/Wardrobe'
import {
  MAX_EMOTES,
  PANEL_SLOTS,
  backEquipment,
  bundleConfirmMessage,
  canToggleEmote,
  equipAction,
  equippedBackId,
  isBackSlot,
  isEquippedIn,
  isOwned,
  slotOf
} from './cosmetics/cosmetics-utils'
import { useBuyCosmetic, useCosmeticsMutations, useCosmeticsView } from './cosmetics/useCosmetics'

const EMPTY_OWNED: readonly string[] = []
const EMPTY_SHOP: readonly ShopItem[] = []

/** Tokens arrive while playing; refresh the balance every minute while this page is open. */
const ONLINE_POLL_MS = 60_000

const SOURCE_META: Record<
  CosmeticsView['source'],
  { label: string; icon: JSX.Element; tone: BadgeTone; hint: string }
> = {
  remote: {
    label: 'Live catalogue',
    icon: <Cloud />,
    tone: 'success',
    hint: 'Fetched from the Shard cosmetics manifest.'
  },
  cache: {
    label: 'Cached catalogue',
    icon: <CloudOff />,
    tone: 'warning',
    hint: 'The manifest could not be reached; this is the last copy Shard saved.'
  },
  bundled: {
    label: 'Bundled catalogue',
    icon: <Package />,
    tone: 'neutral',
    hint: 'Shipped with the launcher. Refresh to look for newer cosmetics.'
  }
}

export function CosmeticsPage() {
  const account = useActiveAccount()
  const viewQuery = useCosmeticsView()
  const onlineQuery = useOnlineState({ pollMs: ONLINE_POLL_MS })
  const online = readyState(onlineQuery.data)
  const m = useCosmeticsMutations()
  const buy = useBuyCosmetic()
  const refreshOnline = useRefreshOnline()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null)

  const view = viewQuery.data
  const byId = useMemo(
    () => new Map<string, Cosmetic>((view?.manifest.cosmetics ?? []).map((c) => [c.id, c])),
    [view]
  )
  const equippedMap = view?.equipped.equipped ?? {}
  const emotes = view?.equipped.emotes ?? []
  // With the Shard API, the API decides what is owned (nothing from the shop while signed out);
  // without it the catalogue does.
  const state = onlineQuery.data
  const owned = useMemo(() => {
    if (!view) return EMPTY_OWNED
    const api =
      state?.status === 'ready'
        ? { owned: state.me.owned, shop: state.shop }
        : state?.status === 'signed-out'
          ? { owned: [], shop: state.shop }
          : null
    return effectiveOwned(view.manifest.cosmetics, view.owned, api)
  }, [view, state])
  const shop = state?.status === 'ready' || state?.status === 'signed-out' ? state.shop : EMPTY_SHOP
  const prices = useMemo(
    () => new Map((online?.shop ?? []).map((item) => [item.id, item.price])),
    [online]
  )

  const offerFor = (c: Cosmetic): BuyOffer | null => {
    const price = prices.get(c.id)
    return online && price !== undefined && !owned.includes(c.id)
      ? { price, tokens: online.me.tokens }
      : null
  }

  const bundleFor = (c: Cosmetic) => bundleState(c, owned, shop, online?.me.tokens ?? null)

  const startBuy = async (c: Cosmetic): Promise<void> => {
    const offer = offerFor(c)
    if (!offer) return
    const names = new Map([...byId.values()].map((x) => [x.id, x.name]))
    const ok = await confirm({
      title: `Buy ${c.name}?`,
      message:
        c.type === 'bundle'
          ? `${bundleConfirmMessage(bundleFor(c), offer.tokens, names)} They are yours on every computer you sign in on.`
          : `It costs ${offer.price} tokens. You will have ${offer.tokens - offer.price} left, and it is yours on every computer you sign in on.`,
      confirmLabel: `Buy for ${offer.price}`
    })
    if (ok) buy.mutate(c)
  }
  const buyingId = buy.isPending ? (buy.variables?.id ?? null) : null

  // Back of the model: hover beats sticky selection beats whatever is equipped.
  const equippedBack = equippedBackId(equippedMap)
  const previewId = hoverId ?? selectedId ?? equippedBack
  const previewItem = previewId ? (byId.get(previewId) ?? null) : null
  const backItem = previewItem && isBackSlot(previewItem.type) ? previewItem : null

  const skin = useTexture(account?.skinUrl)
  const mojangCape = useTexture(backItem ? null : account?.capeUrl)
  const capeUrl = backItem ? (view?.textures[backItem.id] ?? null) : (mojangCape.data ?? null)

  const isEquipped = (c: Cosmetic): boolean => isEquippedIn(c, equippedMap, emotes)

  const toggleEmote = (c: Cosmetic): void => {
    if (!isOwned(c, owned)) {
      if (offerFor(c)) {
        void startBuy(c)
        return
      }
      toast({
        kind: 'info',
        title: 'Not unlocked yet',
        message: `${c.name} is not in your wardrobe.`
      })
      return
    }
    if (!canToggleEmote(emotes, c.id)) {
      toast({
        kind: 'warning',
        title: 'Emote wheel is full',
        message: `The wheel holds ${MAX_EMOTES} emotes. Remove one before adding ${c.name}.`
      })
      return
    }
    m.toggleEmote.mutate(c.id)
  }

  const equipToggle = (c: Cosmetic): void => {
    const slot = slotOf(c.type)
    if (!slot) {
      toggleEmote(c)
      return
    }
    if (!isOwned(c, owned)) {
      if (offerFor(c)) {
        void startBuy(c)
        return
      }
      toast({
        kind: 'info',
        title: 'Not unlocked yet',
        message: `${c.name} is not in your wardrobe.`
      })
      return
    }
    const action = equipAction(c, equippedMap)
    if (action) m.equip.mutate({ type: action.type, id: action.id })
  }

  const onCardClick = (c: Cosmetic): void => {
    if (c.type === 'bundle') return
    if (c.type === 'emote') {
      toggleEmote(c)
      return
    }
    if (isBackSlot(c.type)) {
      setSelectedId((cur) => (cur === c.id ? null : c.id))
      return
    }
    setDetail({ id: c.id, open: true })
  }

  const pendingId = m.equip.isPending
    ? (m.equip.variables?.id ?? null)
    : m.toggleEmote.isPending
      ? (m.toggleEmote.variables ?? null)
      : null

  // Items the model cannot wear (shield skins, bandanas, hats) preview as a 2D image over it.
  const flatItem = previewItem && !backItem && slotOf(previewItem.type) ? previewItem : null
  const previewTarget = backItem ?? flatItem
  const preview: PreviewState | null = previewTarget
    ? {
        cosmetic: previewTarget,
        equipped: isEquipped(previewTarget),
        owned: isOwned(previewTarget, owned),
        offer: offerFor(previewTarget),
        clearable: hoverId !== null || selectedId !== null,
        imageUrl: flatItem ? (view?.previews[flatItem.id] ?? null) : null
      }
    : null
  const panelSlots = PANEL_SLOTS.filter((slot) =>
    (view?.manifest.cosmetics ?? []).some((c) => c.type === slot)
  )

  const detailCosmetic = detail ? (byId.get(detail.id) ?? null) : null
  const source = view ? SOURCE_META[view.source] : null

  return (
    <PageBody wide>
      <PageHeader
        title="Cosmetics"
        description="Pick what you wear. The preview shows it on your skin, and Shard Client shows your cape, shield skin and bandana in-game to every Shard player."
        action={
          <>
            {online && <TokenBalance me={online.me} />}
            {view && source && (
              <Tooltip
                content={`${source.hint} Updated ${formatRelative(view.manifest.updatedAt)}.`}
              >
                <span className="inline-flex">
                  <Badge tone={source.tone} icon={source.icon}>
                    {source.label}
                  </Badge>
                </span>
              </Tooltip>
            )}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw />}
              loading={m.refresh.isPending}
              onClick={() => {
                m.refresh.mutate()
                refreshOnline.mutate()
              }}
            >
              Refresh
            </Button>
          </>
        }
      />

      {onlineQuery.data && onlineQuery.data.status !== 'ready' && (
        <OnlineNote
          className="mt-4"
          state={onlineQuery.data}
          onRetry={() => refreshOnline.mutate()}
          retrying={refreshOnline.isPending}
          signedOutHint="Sign in to earn tokens and buy cosmetics"
        />
      )}

      <div className="mt-6 grid grid-cols-[400px_minmax(0,1fr)] items-start gap-6">
        <CosmeticPreviewCard
          className="sticky top-0"
          skinUrl={skin.data ?? null}
          capeUrl={capeUrl}
          back={backEquipment(backItem?.type ?? null)}
          model={account?.skinVariant ?? 'auto'}
          signedIn={account !== null}
          preview={preview}
          pending={pendingId !== null && pendingId === previewTarget?.id}
          onEquipToggle={() => previewTarget && equipToggle(previewTarget)}
          onBuy={() => previewTarget && void startBuy(previewTarget)}
          buying={previewTarget !== null && buyingId === previewTarget.id}
          onClearPreview={() => {
            setHoverId(null)
            setSelectedId(null)
          }}
          equipped={view?.equipped ?? null}
          byId={byId}
          onUnequip={(slot) => m.equip.mutate({ type: slot, id: null })}
          onRemoveEmote={(id) => m.toggleEmote.mutate(id)}
          panelSlots={panelSlots}
          loading={viewQuery.isLoading}
        />
        <Wardrobe
          view={view}
          loading={viewQuery.isLoading}
          error={viewQuery.isError ? viewQuery.error : null}
          onRetry={() => void viewQuery.refetch()}
          retrying={viewQuery.isFetching}
          selectedId={selectedId}
          onHover={(c) => setHoverId(c && slotOf(c.type) ? c.id : null)}
          onCardClick={onCardClick}
          onPrimary={equipToggle}
          pendingId={pendingId}
          owned={owned}
          offerFor={offerFor}
          onBuy={(c) => void startBuy(c)}
          buyingId={buyingId}
          renderBundle={(b) => (
            <BundleCard
              bundle={b}
              previewUrl={view?.previews[b.id] ?? null}
              itemsById={byId}
              state={bundleFor(b)}
              tokens={online?.me.tokens ?? null}
              onBuy={() => void startBuy(b)}
              buying={buyingId === b.id}
              onItemClick={onCardClick}
            />
          )}
        />
      </div>

      <CosmeticDetailDialog
        cosmetic={detailCosmetic}
        open={detail?.open ?? false}
        previewUrl={detailCosmetic ? (view?.previews[detailCosmetic.id] ?? null) : null}
        owned={detailCosmetic ? isOwned(detailCosmetic, owned) : false}
        equipped={detailCosmetic ? isEquipped(detailCosmetic) : false}
        pending={detailCosmetic !== null && pendingId === detailCosmetic.id}
        onClose={() => setDetail((d) => (d ? { ...d, open: false } : null))}
        onEquipToggle={() => detailCosmetic && equipToggle(detailCosmetic)}
        offer={detailCosmetic ? offerFor(detailCosmetic) : null}
        onBuy={() => detailCosmetic && void startBuy(detailCosmetic)}
        buying={detailCosmetic !== null && buyingId === detailCosmetic.id}
      />
    </PageBody>
  )
}
