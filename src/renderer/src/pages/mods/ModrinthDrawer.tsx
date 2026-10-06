import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCount } from '@shared/format'
import { type InstanceModsView, type ModrinthSortIndex } from '@shared/types'
import { cn } from '@/lib/cn'
import { IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { InstallPlanDialog } from './InstallPlanDialog'
import { ModrinthHitCard } from './ModrinthHitCard'
import { ModrinthProjectPanel } from './ModrinthProjectPanel'
import {
  MODRINTH_CATEGORIES,
  MODRINTH_SORTS,
  categoryLabel,
  conflictReasonForSlug,
  hitState,
  toggleInList
} from './mods-utils'
import { useDebouncedValue } from './useDebouncedValue'
import { useInstallFlow } from './useInstallFlow'
import { useModrinthSearch } from './useModrinth'

export interface ModrinthDrawerProps {
  open: boolean
  onClose: () => void
  view: InstanceModsView | null
  busy: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** True while a dialog or menu sits above the drawer and should own Escape/Tab. */
const stackedLayerOpen = (): boolean =>
  document.querySelector('[role="dialog"]:not([data-drawer]), [role="menu"]') !== null

function SkeletonHits({ count }: { count: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass flex gap-3 rounded-[var(--radius-lg)] p-3">
          <Skeleton className="size-14 rounded-[12px]" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

function DrawerBody({
  view,
  busy,
  onClose
}: {
  view: InstanceModsView
  busy: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 300)
  const [sort, setSort] = useState<ModrinthSortIndex>('relevance')
  const [categories, setCategories] = useState<string[]>([])
  const [selected, setSelected] = useState<{ idOrSlug: string; author: string | null } | null>(null)
  const flow = useInstallFlow(view.instanceId)
  const search = useModrinthSearch(
    { query: debounced, gameVersion: view.minecraftVersion, index: sort, categories },
    true
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = search

  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root || !hasNextPage || selected) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { root, rootMargin: '240px 0px' }
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, selected])

  const hits = search.data?.pages.flatMap((p) => p.hits) ?? []
  const total = search.data?.pages[0]?.totalHits ?? null
  const mc = view.minecraftVersion

  return (
    <>
      <header className="border-b border-line px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight text-fg">Browse Modrinth</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Fabric mods for Minecraft {mc}. Shard Core mods are already included.
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
            <X />
          </IconButton>
        </div>
        {!selected && (
          <>
            <div className="mt-4 flex gap-2">
              <Input
                data-autofocus
                leftIcon={<Search />}
                placeholder="Search mods"
                aria-label="Search Modrinth"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rightSlot={
                  query ? (
                    <IconButton label="Clear search" size="xs" onClick={() => setQuery('')}>
                      <X />
                    </IconButton>
                  ) : undefined
                }
              />
              <Select<ModrinthSortIndex>
                value={sort}
                onChange={setSort}
                options={MODRINTH_SORTS}
                className="w-[190px]"
                aria-label="Sort results"
              />
            </div>
            <div
              className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]"
              role="group"
              aria-label="Categories"
            >
              {MODRINTH_CATEGORIES.map((c) => {
                const active = categories.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategories((cur) => toggleInList(cur, c))}
                    className={cn(
                      'press h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium transition-colors',
                      active
                        ? 'border-accent/50 bg-accent/15 text-accent'
                        : 'border-line bg-white/4 text-fg-muted hover:border-line-strong hover:text-fg'
                    )}
                  >
                    {categoryLabel(c)}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 h-4 text-xs text-fg-subtle" aria-live="polite">
              {total === null ? (
                search.isError ? null : (
                  <Skeleton className="h-3 w-24" />
                )
              ) : (
                `${formatCount(total)} ${total === 1 ? 'result' : 'results'}`
              )}
            </div>
          </>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div
              key={`project:${selected.idOrSlug}`}
              className="absolute inset-0"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModrinthProjectPanel
                idOrSlug={selected.idOrSlug}
                author={selected.author}
                view={view}
                busy={busy}
                flow={flow}
                onBack={() => setSelected(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="results"
              className="absolute inset-0"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div ref={scrollRef} className="scroll-area h-full px-5 py-4">
                {search.isLoading ? (
                  <SkeletonHits count={6} />
                ) : search.isError ? (
                  <ErrorCard
                    error={search.error}
                    onRetry={() => void search.refetch()}
                    retrying={search.isFetching}
                    offlineHint="Modrinth needs a connection. Mods already installed keep working."
                  />
                ) : hits.length === 0 ? (
                  <EmptyState
                    icon={<Search />}
                    title="No mods found"
                    description={
                      debounced
                        ? `Nothing on Modrinth matches “${debounced}” for Minecraft ${mc}.`
                        : `No Fabric mods are listed for Minecraft ${mc} with these filters.`
                    }
                  />
                ) : (
                  <div
                    className={cn(
                      'space-y-2 transition-opacity',
                      search.isPlaceholderData && 'opacity-60'
                    )}
                  >
                    {hits.map((hit) => (
                      <ModrinthHitCard
                        key={hit.projectId}
                        hit={hit}
                        state={hitState(hit, view)}
                        conflictReason={conflictReasonForSlug(hit.slug, view.manifest)}
                        installing={flow.inFlight.has(hit.projectId)}
                        busy={busy}
                        onOpen={() => setSelected({ idOrSlug: hit.slug, author: hit.author })}
                        onInstall={() =>
                          void flow.start({ projectId: hit.projectId, title: hit.title })
                        }
                      />
                    ))}
                  </div>
                )}
                <div ref={sentinelRef} className="h-px" aria-hidden />
                {isFetchingNextPage && <SkeletonHits count={2} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <InstallPlanDialog
        pending={flow.pending}
        onCancel={flow.cancel}
        onConfirmConflicts={flow.confirmConflicts}
        onConfirmOptions={flow.confirmOptions}
      />
    </>
  )
}

/**
 * Right-hand drawer for browsing and installing Modrinth mods into the selected instance.
 * Traps focus, closes on Escape or overlay click, and restores focus when it closes.
 */
export function ModrinthDrawer({ open, onClose, view, busy }: ModrinthDrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const t = setTimeout(() => {
      const first =
        panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent): void => {
      if (stackedLayerOpen()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (nodes.length === 0) return
        const first = nodes[0]!
        const last = nodes[nodes.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      const prev = previouslyFocused.current as HTMLElement | null
      prev?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[4px]" onMouseDown={onClose} />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Browse Modrinth"
            data-drawer
            initial={{ x: 56, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 56, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
            className="glass-strong absolute inset-y-0 right-0 flex w-[720px] max-w-[92vw] flex-col border-l border-line-strong bg-[#0b0f18]/92 shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.8)]"
          >
            {view ? (
              <DrawerBody view={view} busy={busy} onClose={onClose} />
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between px-5 pt-5">
                  <h2 className="text-lg font-semibold text-fg">Browse Modrinth</h2>
                  <IconButton label="Close" size="sm" onClick={onClose} data-autofocus>
                    <X />
                  </IconButton>
                </div>
                <EmptyState
                  icon={<Search />}
                  title="Pick an instance first"
                  description="Modrinth results are filtered by the instance's Minecraft version."
                  className="flex-1"
                />
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
