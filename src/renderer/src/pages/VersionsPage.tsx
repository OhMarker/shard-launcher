import { AnimatePresence } from 'framer-motion'
import { CloudOff, Layers, RefreshCw, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatRelative } from '@shared/format'
import { useInstances } from '@/hooks/useInstances'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { useSettingsUpdate } from '@/pages/settings/useSettingsUpdate'
import { VersionRow } from '@/pages/versions/VersionRow'
import { instancesForVersion, useRefreshVersions, useVersions } from '@/pages/versions/useVersions'

type VersionsTab = 'all' | 'installed'

function RowSkeleton() {
  return (
    <Card padding="none" className="flex items-center gap-3 px-3.5 py-3" aria-hidden>
      <Skeleton className="size-8 rounded-[9px]" />
      <Skeleton className="size-2 rounded-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-3 w-24" />
      <div className="ml-auto flex items-center gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-[9px]" />
      </div>
    </Card>
  )
}

export function VersionsPage() {
  const showSnapshots = useSettings((s) => s.settings.showSnapshots)
  const update = useSettingsUpdate()
  const { data, isLoading, isError, refetch, isFetching } = useVersions(showSnapshots)
  const refresh = useRefreshVersions(showSnapshots)
  const { data: instances } = useInstances()
  const [tab, setTab] = useState<VersionsTab>('all')

  const rows = useMemo(() => {
    const versions = data?.versions ?? []
    return versions.map((entry) => ({ entry, instances: instancesForVersion(entry, instances) }))
  }, [data, instances])
  const installedRows = rows.filter((r) => r.entry.state !== 'not-installed' || r.instances.length > 0)
  const visible = tab === 'installed' ? installedRows : rows
  const busy = isFetching || refresh.isPending

  return (
    <PageBody>
      <PageHeader
        title="Versions"
        description="Every Minecraft release from 1.21 onwards. New versions appear here automatically."
        action={
          <>
            {data?.offline && (
              <Badge tone="warning" icon={<WifiOff />}>
                Offline · cached list
              </Badge>
            )}
            <Switch
              size="sm"
              checked={showSnapshots}
              onCheckedChange={(checked) => void update({ showSnapshots: checked })}
              label="Show snapshots"
              className="gap-3"
            />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw className={cn(busy && 'animate-[spin_0.9s_linear_infinite]')} />}
              onClick={() => refresh.mutate()}
              disabled={busy}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="mt-6 flex items-center justify-between gap-4">
        <Tabs<VersionsTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All', count: data ? rows.length : undefined },
            { value: 'installed', label: 'Installed', count: data ? installedRows.length : undefined }
          ]}
        />
        <span className="text-xs tabular-nums text-fg-subtle">{data ? `Updated ${formatRelative(data.fetchedAt)}` : ' '}</span>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
        ) : !data && isError ? (
          <Card>
            <EmptyState
              icon={<CloudOff />}
              title="Can't reach Mojang right now"
              description="The version list could not be downloaded and there is no cached copy yet. Check your connection and try again."
              action={
                <Button variant="primary" leftIcon={<RefreshCw />} onClick={() => void refetch()} loading={isFetching}>
                  Retry
                </Button>
              }
            />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Layers />}
              title={tab === 'installed' ? 'Nothing installed yet' : 'No versions to show'}
              description={
                tab === 'installed'
                  ? 'Install a version from the All tab and it shows up here.'
                  : showSnapshots
                    ? 'Mojang has not published anything from 1.21 onwards yet.'
                    : 'Turn on "Show snapshots" to include pre-release builds.'
              }
              action={
                tab === 'installed' ? (
                  <Button variant="secondary" onClick={() => setTab('all')}>
                    Browse all versions
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map(({ entry, instances: versionInstances }) => (
              <VersionRow key={entry.id} entry={entry} instances={versionInstances} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </PageBody>
  )
}
