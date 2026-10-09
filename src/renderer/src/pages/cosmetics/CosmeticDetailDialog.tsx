import { Check, Info, Lock, Sparkles } from 'lucide-react'
import { type Cosmetic } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Tooltip } from '@/components/ui/Tooltip'
import { BuyButton, type BuyOffer } from '@/components/cosmetics/BuyButton'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { RarityBadge } from '@/components/cosmetics/RarityBadge'
import { TypeIcon } from '@/components/cosmetics/TypeIcon'
import { TYPE_HINTS, TYPE_LABELS } from './cosmetics-utils'

export interface CosmeticDetailDialogProps {
  /** Kept while the dialog animates out, so `open` is separate. */
  cosmetic: Cosmetic | null
  open: boolean
  previewUrl: string | null
  owned: boolean
  equipped: boolean
  pending: boolean
  onClose: () => void
  onEquipToggle: () => void
  offer: BuyOffer | null
  onBuy: () => void
  buying: boolean
}

/** 2D preview for cosmetics the 3D viewer cannot show (shield skins, hats, bandanas, backbling). */
export function CosmeticDetailDialog({
  cosmetic,
  open,
  previewUrl,
  owned,
  equipped,
  pending,
  onClose,
  onEquipToggle,
  offer,
  onBuy,
  buying
}: CosmeticDetailDialogProps) {
  return (
    <Dialog
      open={open && cosmetic !== null}
      onClose={onClose}
      title={cosmetic?.name}
      description={cosmetic ? `${TYPE_LABELS[cosmetic.type]} by ${cosmetic.author}` : undefined}
      size="md"
      footer={
        cosmetic && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {owned ? (
              <Button
                variant={equipped ? 'secondary' : 'primary'}
                loading={pending}
                leftIcon={equipped ? <Check /> : undefined}
                onClick={onEquipToggle}
                data-autofocus
              >
                {equipped ? 'Unequip' : 'Equip'}
              </Button>
            ) : offer ? (
              <BuyButton size="md" offer={offer} onBuy={onBuy} loading={buying} />
            ) : (
              <Tooltip content="Not unlocked yet">
                <span className="inline-flex">
                  <Button variant="primary" disabled leftIcon={<Lock />}>
                    Locked
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        )
      }
    >
      {cosmetic && (
        <div className="space-y-4">
          <CosmeticTile
            cosmetic={cosmetic}
            previewUrl={previewUrl}
            className="mx-auto aspect-square w-full max-w-[320px] rounded-[16px] border border-line"
            iconClassName="size-16"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <RarityBadge rarity={cosmetic.rarity} size="md" />
            <Badge tone="neutral" icon={<TypeIcon type={cosmetic.type} />}>
              {TYPE_LABELS[cosmetic.type]}
            </Badge>
            {cosmetic.animated && (
              <Badge tone="info" icon={<Sparkles />}>
                Animated
              </Badge>
            )}
            {equipped && (
              <Badge tone="accent" icon={<Check />}>
                Equipped
              </Badge>
            )}
            {cosmetic.tags.map((t) => (
              <Badge key={t} tone="outline">
                {t}
              </Badge>
            ))}
          </div>
          {TYPE_HINTS[cosmetic.type] && (
            <p className="text-sm font-medium text-fg">{TYPE_HINTS[cosmetic.type]}.</p>
          )}
          {cosmetic.description && (
            <p className="text-sm leading-relaxed text-fg-muted">{cosmetic.description}</p>
          )}
          <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-white/4 p-3 text-[13px] text-fg-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            The 3D preview shows capes, cloaks and wings only; other items show this picture. Shard
            Client draws your equipped cape, shield skin and bandana in-game.
          </div>
        </div>
      )}
    </Dialog>
  )
}
