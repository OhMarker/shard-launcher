import { Pencil, Star, Trash } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { type SavedSkin } from '@shared/types'
import { cn } from '@/lib/cn'
import { variantLabel } from '@/pages/skins/skins-utils'
import { PlayerHead } from '@/components/player/PlayerHead'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'

export interface SkinCardProps {
  skin: SavedSkin
  selected: boolean
  busy?: boolean
  onSelect: () => void
  onToggleFavorite: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

const MAX_NAME = 48

/** Library tile: click to preview, double-click (or the pencil) to rename inline. */
export function SkinCard({
  skin,
  selected,
  busy,
  onSelect,
  onToggleFavorite,
  onRename,
  onDelete
}: SkinCardProps) {
  // null = not editing; otherwise the draft name.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (): void => {
    if (draft === null) return
    const name = draft.trim().slice(0, MAX_NAME)
    if (name && name !== skin.name) onRename(name)
    setDraft(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
    }
  }

  const meta = (
    <div className="mt-1 flex items-center gap-1.5">
      <Badge size="sm" tone={skin.variant === 'slim' ? 'info' : 'neutral'}>
        {variantLabel(skin.variant)}
      </Badge>
      {skin.sourceLabel && (
        <span className="truncate text-[11px] text-fg-subtle">{skin.sourceLabel}</span>
      )}
    </div>
  )

  return (
    <div
      className={cn(
        'glass hover-lift group relative rounded-[var(--radius-lg)]',
        selected && 'border-accent/50 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]'
      )}
    >
      {draft === null ? (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setDraft(skin.name)}
          aria-pressed={selected}
          aria-label={`Preview ${skin.name}`}
          className="flex w-full items-center gap-3 rounded-[inherit] p-3 pr-24 text-left"
        >
          <PlayerHead skinDataUrl={skin.dataUrl} size={48} rounded="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">{skin.name}</div>
            {meta}
          </div>
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 p-3 pr-24">
          <PlayerHead skinDataUrl={skin.dataUrl} size={48} rounded="md" />
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              value={draft}
              maxLength={MAX_NAME}
              aria-label="Skin name"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              className="h-7 w-full rounded-[7px] border border-accent/60 bg-white/6 px-2 text-sm text-fg outline-none"
            />
            {meta}
          </div>
        </div>
      )}

      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconButton
          label={skin.favorite ? 'Remove from favorites' : 'Add to favorites'}
          size="xs"
          aria-pressed={skin.favorite}
          disabled={busy}
          onClick={onToggleFavorite}
          className={cn(skin.favorite && 'text-warning hover:text-warning')}
        >
          <Star className={cn(skin.favorite && 'fill-current')} />
        </IconButton>
        <IconButton
          label={`Rename ${skin.name}`}
          size="xs"
          disabled={busy}
          onClick={() => setDraft(skin.name)}
        >
          <Pencil />
        </IconButton>
        <IconButton
          label={`Delete ${skin.name}`}
          size="xs"
          variant="danger"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash />
        </IconButton>
      </div>
    </div>
  )
}
