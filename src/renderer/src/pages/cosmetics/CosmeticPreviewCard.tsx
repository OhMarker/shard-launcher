import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock, PartyPopper, X } from 'lucide-react'
import { type ReactNode } from 'react'
import {
  COSMETIC_TYPES,
  type Cosmetic,
  type CosmeticSlot,
  type EquippedCosmetics
} from '@shared/types'
import { cn } from '@/lib/cn'
import { SkinViewer } from '@/components/player/SkinViewer'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { TypeIcon } from '@/components/cosmetics/TypeIcon'
import { TYPE_LABELS } from './cosmetics-utils'

const SLOTS = COSMETIC_TYPES.filter((t): t is CosmeticSlot => t !== 'emote')

export interface PreviewState {
  cosmetic: Cosmetic
  equipped: boolean
  owned: boolean
  /** True when the preview came from hover/selection rather than the equipped item. */
  clearable: boolean
}

export interface CosmeticPreviewCardProps {
  skinUrl: string | null
  capeUrl: string | null
  back: 'cape' | 'elytra'
  model: 'classic' | 'slim' | 'auto'
  signedIn: boolean
  preview: PreviewState | null
  pending: boolean
  onEquipToggle: () => void
  onClearPreview: () => void
  equipped: EquippedCosmetics | null
  byId: ReadonlyMap<string, Cosmetic>
  onUnequip: (slot: CosmeticSlot) => void
  onRemoveEmote: (id: string) => void
  loading: boolean
  className?: string
}

function Chip({
  icon,
  label,
  hint,
  onRemove,
  removeLabel
}: {
  icon: ReactNode
  label: string
  hint: string
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-white/6 pl-2.5 pr-1 text-xs text-fg [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-muted"
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="text-fg-subtle">· {hint}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="ml-0.5 flex size-5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-white/10 hover:text-fg"
      >
        <X />
      </button>
    </motion.span>
  )
}

export function CosmeticPreviewCard({
  skinUrl,
  capeUrl,
  back,
  model,
  signedIn,
  preview,
  pending,
  onEquipToggle,
  onClearPreview,
  equipped,
  byId,
  onUnequip,
  onRemoveEmote,
  loading,
  className
}: CosmeticPreviewCardProps) {
  const slotChips = equipped
    ? SLOTS.flatMap((slot) => {
        const id = equipped.equipped[slot]
        return id ? [{ slot, id, name: byId.get(id)?.name ?? id }] : []
      })
    : []
  const emotes = equipped?.emotes ?? []
  const nothing = slotChips.length === 0 && emotes.length === 0

  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="relative h-[420px] bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-rgb)/0.14),transparent_65%)]">
        <SkinViewer
          skinUrl={skinUrl}
          capeUrl={capeUrl}
          model={model}
          back={back}
          animation="idle"
          zoom={0.85}
        />
        {!signedIn && (
          <div className="pointer-events-none absolute left-3 top-3">
            <Badge tone="neutral" className="glass-strong">
              Sign in to preview on your own skin
            </Badge>
          </div>
        )}
        <AnimatePresence>
          {preview && (
            <motion.div
              key={preview.cosmetic.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="glass-strong absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-[14px] p-2.5"
            >
              <TypeIcon type={preview.cosmetic.type} className="size-4 shrink-0 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">{preview.cosmetic.name}</div>
                <div className="text-[11px] text-fg-subtle">
                  {preview.equipped ? 'Equipped' : 'Previewing'} ·{' '}
                  {TYPE_LABELS[preview.cosmetic.type]}
                </div>
              </div>
              {preview.owned ? (
                <Button
                  size="sm"
                  variant={preview.equipped ? 'secondary' : 'primary'}
                  loading={pending}
                  leftIcon={preview.equipped ? <Check /> : undefined}
                  onClick={onEquipToggle}
                >
                  {preview.equipped ? 'Unequip' : 'Equip'}
                </Button>
              ) : (
                <Tooltip content="Not unlocked yet">
                  <span className="inline-flex">
                    <Button size="sm" variant="outline" disabled leftIcon={<Lock />}>
                      Locked
                    </Button>
                  </span>
                </Tooltip>
              )}
              {preview.clearable && (
                <IconButton label="Stop previewing" size="sm" onClick={onClearPreview}>
                  <X />
                </IconButton>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-line p-4">
        <div className="text-[13px] font-medium text-fg">Equipped</div>
        {loading && !equipped ? (
          <div className="mt-2 flex gap-1.5" aria-hidden>
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        ) : nothing ? (
          <p className="mt-1.5 text-xs text-fg-subtle">
            Nothing equipped yet. Pick something from the wardrobe.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {slotChips.map(({ slot, id, name }) => (
                <Chip
                  key={`${slot}:${id}`}
                  icon={<TypeIcon type={slot} />}
                  label={name}
                  hint={TYPE_LABELS[slot]}
                  onRemove={() => onUnequip(slot)}
                  removeLabel={`Unequip ${name}`}
                />
              ))}
              {emotes.map((id) => (
                <Chip
                  key={`emote:${id}`}
                  icon={<PartyPopper />}
                  label={byId.get(id)?.name ?? id}
                  hint="Emote"
                  onRemove={() => onRemoveEmote(id)}
                  removeLabel={`Remove ${byId.get(id)?.name ?? id} from the emote wheel`}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Card>
  )
}
