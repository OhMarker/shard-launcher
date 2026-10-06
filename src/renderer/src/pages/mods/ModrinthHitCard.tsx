import { motion } from 'framer-motion'
import { Download, Heart } from 'lucide-react'
import { formatCount, formatRelative } from '@shared/format'
import { type ModrinthSearchHit } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { InstallStateControl } from '@/components/mods/InstallStateControl'
import { ModIcon } from '@/components/mods/ModIcon'
import { categoryLabel, type HitState } from './mods-utils'

export interface ModrinthHitCardProps {
  hit: ModrinthSearchHit
  state: HitState
  conflictReason: string | null
  installing: boolean
  busy: boolean
  onOpen: () => void
  onInstall: () => void
}

export function ModrinthHitCard({
  hit,
  state,
  conflictReason,
  installing,
  busy,
  onOpen,
  onInstall
}: ModrinthHitCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card interactive padding="sm" className="flex gap-3" onClick={onOpen}>
        <ModIcon src={hit.iconUrl} name={hit.title} size={56} className="rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              className="truncate text-left text-sm font-semibold text-fg hover:underline"
            >
              {hit.title}
            </button>
            <span className="truncate text-xs text-fg-subtle">by {hit.author}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg-muted">
            {hit.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-1 text-[11px] tabular-nums text-fg-subtle">
              <Download className="size-3" aria-hidden />
              {formatCount(hit.downloads)}
            </span>
            <span className="flex items-center gap-1 text-[11px] tabular-nums text-fg-subtle">
              <Heart className="size-3" aria-hidden />
              {formatCount(hit.follows)}
            </span>
            <span className="text-[11px] text-fg-subtle">
              Updated {formatRelative(hit.dateModified)}
            </span>
            {hit.displayCategories.slice(0, 4).map((c) => (
              <Badge key={c} size="sm" tone="neutral">
                {categoryLabel(c)}
              </Badge>
            ))}
          </div>
        </div>
        <div
          className="flex shrink-0 flex-col items-end justify-start"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <InstallStateControl
            state={state}
            conflictReason={conflictReason}
            installing={installing}
            busy={busy}
            onInstall={onInstall}
          />
        </div>
      </Card>
    </motion.div>
  )
}
