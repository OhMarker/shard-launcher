import { Cloud, CloudOff, Package, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatRelative } from '@shared/format'
import { type Cosmetic, type CosmeticsView } from '@shared/types'
import { useActiveAccount } from '@/hooks/useAccounts'
import { useTexture } from '@/hooks/useTexture'
import { toast } from '@/stores/ui'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Tooltip } from '@/components/ui/Tooltip'
import { CosmeticDetailDialog } from './cosmetics/CosmeticDetailDialog'
import { CosmeticPreviewCard, type PreviewState } from './cosmetics/CosmeticPreviewCard'
import { Wardrobe } from './cosmetics/Wardrobe'
import {
  MAX_EMOTES,
  backEquipment,
  canToggleEmote,
  equippedBackId,
  isBackSlot,
  isOwned,
  slotOf
} from './cosmetics/cosmetics-utils'
import { useCosmeticsMutations, useCosmeticsView } from './cosmetics/useCosmetics'

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
  const m = useCosmeticsMutations()
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
  const owned = view?.owned ?? []

  // Back of the model: hover beats sticky selection beats whatever is equipped.
  const equippedBack = equippedBackId(equippedMap)
  const previewId = hoverId ?? selectedId ?? equippedBack
  const previewItem = previewId ? (byId.get(previewId) ?? null) : null
  const backItem = previewItem && isBackSlot(previewItem.type) ? previewItem : null

  const skin = useTexture(account?.skinUrl)
  const mojangCape = useTexture(backItem ? null : account?.capeUrl)
  const capeUrl = backItem ? (view?.textures[backItem.id] ?? null) : (mojangCape.data ?? null)

  const isEquipped = (c: Cosmetic): boolean =>
    c.type === 'emote' ? emotes.includes(c.id) : equippedMap[c.type] === c.id

  const toggleEmote = (c: Cosmetic): void => {
    if (!isOwned(c, owned)) {
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
      toast({
        kind: 'info',
        title: 'Not unlocked yet',
        message: `${c.name} is not in your wardrobe.`
      })
      return
    }
    m.equip.mutate({ type: slot, id: isEquipped(c) ? null : c.id })
  }

  const onCardClick = (c: Cosmetic): void => {
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

  const preview: PreviewState | null = backItem
    ? {
        cosmetic: backItem,
        equipped: isEquipped(backItem),
        owned: isOwned(backItem, owned),
        clearable: hoverId !== null || selectedId !== null
      }
    : null

  const detailCosmetic = detail ? (byId.get(detail.id) ?? null) : null
  const source = view ? SOURCE_META[view.source] : null

  return (
    <PageBody wide>
      <PageHeader
        title="Cosmetics"
        description="Capes, cloaks, wings and more. Equipped items render in-game through the Shard client."
        action={
          <>
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
              onClick={() => m.refresh.mutate()}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-[400px_minmax(0,1fr)] items-start gap-6">
        <CosmeticPreviewCard
          className="sticky top-0"
          skinUrl={skin.data ?? null}
          capeUrl={capeUrl}
          back={backEquipment(backItem?.type ?? null)}
          model={account?.skinVariant ?? 'auto'}
          signedIn={account !== null}
          preview={preview}
          pending={pendingId !== null && pendingId === backItem?.id}
          onEquipToggle={() => backItem && equipToggle(backItem)}
          onClearPreview={() => {
            setHoverId(null)
            setSelectedId(null)
          }}
          equipped={view?.equipped ?? null}
          byId={byId}
          onUnequip={(slot) => m.equip.mutate({ type: slot, id: null })}
          onRemoveEmote={(id) => m.toggleEmote.mutate(id)}
          loading={viewQuery.isLoading}
        />
        <Wardrobe
          view={view}
          loading={viewQuery.isLoading}
          error={viewQuery.isError ? viewQuery.error : null}
          onRetry={() => void viewQuery.refetch()}
          retrying={viewQuery.isFetching}
          selectedId={selectedId}
          onHover={(c) => setHoverId(c && isBackSlot(c.type) ? c.id : null)}
          onCardClick={onCardClick}
          onPrimary={equipToggle}
          pendingId={pendingId}
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
      />
    </PageBody>
  )
}
