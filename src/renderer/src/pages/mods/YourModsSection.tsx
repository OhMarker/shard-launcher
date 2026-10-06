import { AnimatePresence, motion } from 'framer-motion'
import { Blocks, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type InstalledMod, type InstanceModsView } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { SectionHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Select'
import { DropZone } from '@/components/mods/DropZone'
import { YOUR_MODS_SORTS, conflictReason, filterAndSortMods, type YourModsSort } from './mods-utils'
import { type ModsMutations } from './useModsData'
import { YourModRow } from './YourModRow'

export interface YourModsSectionProps {
  view: InstanceModsView
  busy: boolean
  m: ModsMutations
  onBrowse: () => void
  onImport: (droppedNames: string[] | null) => void
}

export function YourModsSection({ view, busy, m, onBrowse, onImport }: YourModsSectionProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<YourModsSort>('name')
  const list = useMemo(() => filterAndSortMods(view.yours, query, sort), [view.yours, query, sort])

  const pendingFile = m.setEnabled.isPending
    ? m.setEnabled.variables?.fileName
    : m.update.isPending
      ? m.update.variables
      : m.remove.isPending
        ? m.remove.variables
        : null

  const remove = async (mod: InstalledMod): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${mod.name}?`,
      message:
        'The jar is deleted from this instance. You can install it again from Modrinth or re-import the file.',
      confirmLabel: 'Remove',
      danger: true
    })
    if (ok) m.remove.mutate(mod.fileName)
  }

  return (
    <section aria-labelledby="your-mods-heading">
      <SectionHeader
        title={
          <span id="your-mods-heading" className="flex items-center gap-2">
            <Blocks className="size-4 text-fg-muted" aria-hidden />
            Your Mods
            <span className="text-sm font-normal tabular-nums text-fg-subtle">
              {view.yours.length}
            </span>
          </span>
        }
        description="Mods you added yourself. Shard keeps them apart from Shard Core and checks Modrinth for updates."
        action={
          view.yours.length > 0 && (
            <div className="flex items-center gap-2">
              <Input
                size="sm"
                leftIcon={<Search />}
                placeholder="Filter mods"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter your mods"
                className="w-[220px]"
              />
              <Select<YourModsSort>
                size="sm"
                value={sort}
                onChange={setSort}
                options={YOUR_MODS_SORTS}
                className="w-[150px]"
                aria-label="Sort mods"
              />
            </div>
          )
        }
      />

      <Card padding="none" className="mt-3 overflow-hidden">
        {view.yours.length === 0 ? (
          <EmptyState
            compact
            icon={<Blocks />}
            title="No mods of your own yet"
            description="Browse Modrinth or drop a jar below. Performance mods are already covered by Shard Core."
            action={
              <Button size="sm" variant="primary" leftIcon={<Search />} onClick={onBrowse}>
                Browse Modrinth
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            compact
            title="No mods match"
            description={`Nothing in this instance matches “${query.trim()}”.`}
          />
        ) : (
          <div className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {list.map((mod) => (
                <motion.div
                  key={mod.fileName}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <YourModRow
                    mod={mod}
                    conflict={conflictReason(mod, view.manifest)}
                    busy={busy}
                    pending={pendingFile === mod.fileName}
                    onToggle={(enabled) => m.setEnabled.mutate({ fileName: mod.fileName, enabled })}
                    onUpdate={() => m.update.mutate(mod.fileName)}
                    onOpenFile={() => m.openFile(mod.fileName)}
                    onRemove={() => void remove(mod)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>

      <DropZone className="mt-3" disabled={busy} onPick={onImport} />
    </section>
  )
}
