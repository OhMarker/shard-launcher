import { AnimatePresence, motion } from 'framer-motion'
import { Images, UserRound } from 'lucide-react'
import { type SavedSkin } from '@shared/types'
import { cn } from '@/lib/cn'
import { RemotePlayerHead } from '@/components/player/PlayerHead'
import { Badge } from '@/components/ui/Badge'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { SkinCard } from '@/components/skins/SkinCard'
import { type SkinMutations } from './useSkins'

export interface SkinLibraryProps {
  /** Already sorted (favorites first). */
  skins: SavedSkin[]
  loading: boolean
  error: unknown
  onRetry: () => void
  /** null selects the profile's current skin. */
  selectedId: string | null
  onSelect: (id: string | null) => void
  currentSkinUrl: string | null
  m: SkinMutations
  className?: string
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass flex items-center gap-3 rounded-[var(--radius-lg)] p-3">
          <Skeleton className="size-12 rounded-[8px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkinLibrary({
  skins,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  currentSkinUrl,
  m,
  className
}: SkinLibraryProps) {
  const busy = m.update.isPending || m.remove.isPending

  const remove = async (skin: SavedSkin): Promise<void> => {
    const ok = await confirm({
      title: `Delete ${skin.name}?`,
      message:
        'The skin is removed from your library. It stays on your Minecraft profile if it is applied.',
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    if (selectedId === skin.id) onSelect(null)
    m.remove.mutate(skin.id)
  }

  return (
    <section className={className} aria-labelledby="skin-library-heading">
      <SectionHeader
        title={
          <span id="skin-library-heading" className="flex items-center gap-2">
            <Images className="size-4 text-fg-muted" aria-hidden />
            Skin library
            {!loading && (
              <span className="text-sm font-normal tabular-nums text-fg-subtle">
                {skins.length}
              </span>
            )}
          </span>
        }
        description="Click a skin to preview it on the model. Double-click a name to rename it."
      />
      <div className="mt-3">
        {loading ? (
          <LibrarySkeleton />
        ) : error ? (
          <ErrorCard error={error} onRetry={onRetry} />
        ) : skins.length === 0 ? (
          <div className="glass rounded-[var(--radius-lg)]">
            <EmptyState
              compact
              icon={<Images />}
              title="Your library is empty"
              description="Upload a PNG, copy another player's skin or paste a URL to start collecting."
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-pressed={selectedId === null}
              className={cn(
                'glass hover-lift press flex items-center gap-3 rounded-[var(--radius-lg)] p-3 text-left',
                selectedId === null &&
                  'border-accent/50 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35)]'
              )}
            >
              <RemotePlayerHead skinUrl={currentSkinUrl} size={48} rounded="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-fg">
                  <UserRound className="size-3.5 text-fg-subtle" aria-hidden />
                  Current skin
                </div>
                <div className="mt-1">
                  <Badge size="sm" tone="accent">
                    On your profile
                  </Badge>
                </div>
              </div>
            </button>
            <AnimatePresence initial={false}>
              {skins.map((skin) => (
                <motion.div
                  key={skin.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
                >
                  <SkinCard
                    skin={skin}
                    selected={selectedId === skin.id}
                    busy={busy}
                    onSelect={() => onSelect(skin.id)}
                    onToggleFavorite={() =>
                      m.update.mutate({ id: skin.id, patch: { favorite: !skin.favorite } })
                    }
                    onRename={(name) => m.update.mutate({ id: skin.id, patch: { name } })}
                    onDelete={() => void remove(skin)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  )
}
