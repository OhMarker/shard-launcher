import { Layers } from 'lucide-react'
import { useState } from 'react'
import { type BundledModStatus } from '@shared/types'
import { useInstances, useSelectedInstance } from '@/hooks/useInstances'
import { isBusy, useLaunchState } from '@/stores/launch'
import { toast, useUi } from '@/stores/ui'
import { Button } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { CopyToDialog } from './mods/CopyToDialog'
import { ModrinthDrawer } from './mods/ModrinthDrawer'
import { ModsToolbar } from './mods/ModsToolbar'
import { ShardCoreSection } from './mods/ShardCoreSection'
import { YourModsSection } from './mods/YourModsSection'
import { countUpdates } from './mods/mods-utils'
import { useImportMods, useModsMutations, useModsView } from './mods/useModsData'
import { useModsProgress } from './mods/useModsProgress'

const DESCRIPTION =
  'Shard Core stays in sync on its own. Add your own mods from Modrinth or local jars.'

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="glass divide-y divide-line rounded-[var(--radius-lg)]" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="size-8 rounded-[9px]" />
        </div>
      ))}
    </div>
  )
}

function SectionsSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3.5 w-96" />
        <RowsSkeleton rows={5} />
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3.5 w-80" />
        <RowsSkeleton rows={3} />
      </div>
    </div>
  )
}

export function ModsPage() {
  const instancesQuery = useInstances()
  const instance = useSelectedInstance()
  const selectInstance = useUi((s) => s.selectInstance)
  const navigate = useUi((s) => s.navigate)
  const drawerOpen = useUi((s) => s.modrinthDrawerOpen)
  const setDrawerOpen = useUi((s) => s.setModrinthDrawerOpen)

  const instanceId = instance?.id ?? null
  const busy = isBusy(useLaunchState(instanceId))
  const viewQuery = useModsView(instanceId)
  const [progress, clearProgress] = useModsProgress(instanceId)
  const m = useModsMutations(instanceId)
  const importMods = useImportMods(m)
  const [copyOpen, setCopyOpen] = useState(false)

  const view = viewQuery.data
  const instances = instancesQuery.data ?? []

  const toggleBundled = async (entry: BundledModStatus, enabled: boolean): Promise<void> => {
    if (!enabled) {
      const ok = await confirm({
        title: `Disable ${entry.def.name}?`,
        message:
          'Shard Core mods are tuned for crystal PvP. Disabling can hurt performance or compatibility.',
        confirmLabel: 'Disable',
        danger: true
      })
      if (!ok) return
    }
    m.setBundledEnabled.mutate({ slug: entry.def.slug, enabled })
  }

  const onImport = (droppedNames: string[] | null): void => {
    if (droppedNames) {
      toast({
        kind: 'info',
        title: 'Pick the dropped files to finish',
        message:
          'Shard cannot read file paths from a drop yet, so confirm the same files in the picker.'
      })
    }
    void importMods(droppedNames)
  }

  const syncNow = (): void => {
    m.syncBundled.mutate(undefined, { onSettled: clearProgress })
  }

  if (instancesQuery.isLoading) {
    return (
      <PageBody wide>
        <PageHeader title="Mods" description={DESCRIPTION} />
        <div className="mt-6 space-y-6">
          <div
            className="glass flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3"
            aria-hidden
          >
            <Skeleton className="h-9.5 w-[260px]" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="ml-auto h-8 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
          <SectionsSkeleton />
        </div>
      </PageBody>
    )
  }

  if (!instance) {
    return (
      <PageBody wide>
        <PageHeader title="Mods" description={DESCRIPTION} />
        <EmptyState
          className="mt-16"
          icon={<Layers />}
          title="No instances yet"
          description="Mods live inside an instance. Install a Minecraft version first and come back here."
          action={
            <Button variant="primary" onClick={() => navigate('versions')}>
              Go to Versions
            </Button>
          }
        />
      </PageBody>
    )
  }

  return (
    <PageBody wide>
      <PageHeader title="Mods" description={DESCRIPTION} />
      <div className="mt-6 space-y-6">
        <ModsToolbar
          instances={instances}
          instance={instance}
          onSelectInstance={selectInstance}
          busy={busy}
          updates={view ? countUpdates(view.yours) : 0}
          checking={m.checkUpdates.isPending}
          updating={m.updateAll.isPending}
          onBrowse={() => setDrawerOpen(true)}
          onCheckUpdates={() => m.checkUpdates.mutate()}
          onUpdateAll={() => m.updateAll.mutate(undefined, { onSettled: clearProgress })}
          onImport={() => onImport(null)}
          onCopyTo={() => setCopyOpen(true)}
          onOpenFolder={m.openFolder}
        />

        {viewQuery.isError ? (
          <ErrorCard
            error={viewQuery.error}
            onRetry={() => void viewQuery.refetch()}
            retrying={viewQuery.isFetching}
            offlineHint="The mod list could not be read. Installed mods still load when you launch."
          />
        ) : !view ? (
          <SectionsSkeleton />
        ) : (
          <>
            <ShardCoreSection
              view={view}
              instance={instance}
              busy={busy}
              progress={progress}
              syncing={m.syncBundled.isPending}
              onSync={syncNow}
              togglingSlug={
                m.setBundledEnabled.isPending ? (m.setBundledEnabled.variables?.slug ?? null) : null
              }
              onToggle={(entry, enabled) => void toggleBundled(entry, enabled)}
              onOpenFile={m.openFile}
            />
            <YourModsSection
              view={view}
              busy={busy}
              m={m}
              onBrowse={() => setDrawerOpen(true)}
              onImport={onImport}
            />
          </>
        )}
      </div>

      <CopyToDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        from={instance}
        instances={instances}
        modCount={view?.yours.length ?? 0}
        copyTo={m.copyTo}
      />
      <ModrinthDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        view={view ?? null}
        busy={busy}
      />
    </PageBody>
  )
}
