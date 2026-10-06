import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CloudOff, Gem, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatRelative } from '@shared/format'
import { type ShardBuild } from '@shared/types'
import { useInstances } from '@/hooks/useInstances'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { Collapsible } from './Collapsible'
import { Markdown } from './Markdown'
import { sortBuildsNewestFirst } from './release-notes'
import { useRefreshShardManifest, useShardManifest } from './useUpdates'

function MinecraftVersions({ versions }: { versions: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {versions.map((v) => (
        <Badge key={v} tone="outline" size="sm">
          <span className="font-mono">{v}</span>
        </Badge>
      ))}
    </div>
  )
}

function LatestBuildCard({ build, source, fetchedAt }: { build: ShardBuild; source: 'remote' | 'cache' | 'none'; fetchedAt: string | null }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Latest build</div>
          <div className="mt-0.5 font-mono text-2xl font-semibold text-fg">{build.version}</div>
          <div className="mt-0.5 text-xs text-fg-muted">
            Released {formatDate(build.releasedAt)} · Fabric loader <span className="font-mono">{build.fabricLoader}</span>
          </div>
        </div>
        {source === 'cache' && (
          <Badge tone="warning" icon={<CloudOff />}>
            Cached
          </Badge>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-fg-muted">Supported Minecraft versions</div>
        <MinecraftVersions versions={build.minecraft} />
      </div>
      {build.changelog.trim() && (
        <div>
          <div className="mb-1 text-xs font-medium text-fg-muted">Changelog</div>
          <Markdown compact>{build.changelog}</Markdown>
        </div>
      )}
      {fetchedAt && <div className="text-[11px] text-fg-subtle">Checked {formatRelative(fetchedAt)}</div>}
    </Card>
  )
}

function InstalledClients({ latestVersion }: { latestVersion: string }) {
  const { data: instances } = useInstances()
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const reinstall = useMutation({
    mutationFn: (instanceId: string) => invoke('shard:reinstall', { instanceId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.instances })
      toast({ kind: 'success', title: 'Shard client reinstalled' })
    },
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
  const shardInstances = (instances ?? []).filter((i) => i.type === 'shard' && i.installState !== 'pending')
  if (shardInstances.length === 0) return null

  return (
    <Card className="space-y-2">
      <div className="text-sm font-medium text-fg">Installed in</div>
      {shardInstances.map((instance) => {
        const outdated = instance.shardBuild !== null && instance.shardBuild !== latestVersion
        const pending = reinstall.isPending && reinstall.variables === instance.id
        return (
          <div key={instance.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-white/4 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-fg">{instance.name}</div>
              <div className="font-mono text-[11.5px] text-fg-muted">
                {instance.minecraftVersion} · {instance.shardBuild ?? 'client pending'}
              </div>
            </div>
            {outdated && (
              <Badge tone="info" size="sm">
                Newer build available
              </Badge>
            )}
            <Button
              size="xs"
              variant="secondary"
              leftIcon={<RefreshCw />}
              onClick={() => reinstall.mutate(instance.id)}
              loading={pending}
              disabled={instance.running || (reinstall.isPending && !pending)}
            >
              Reinstall client
            </Button>
          </div>
        )
      })}
    </Card>
  )
}

/** Right column of the Updates page: the Shard client manifest. */
export function ShardClientPanel({ className }: { className?: string }) {
  const { data: view, isLoading, isError, refetch } = useShardManifest()
  const refresh = useRefreshShardManifest()
  const [historyOpen, setHistoryOpen] = useState<string | null>(null)

  const manifest = view?.manifest ?? null
  const builds = manifest ? sortBuildsNewestFirst(manifest.builds) : []
  const latest = manifest ? (manifest.builds.find((b) => b.version === manifest.latest) ?? builds[0] ?? null) : null

  return (
    <section className={cn('space-y-4', className)} aria-labelledby="shard-client-heading">
      <SectionHeader
        title={<span id="shard-client-heading">Shard client</span>}
        description="The client jar injected into Shard instances."
        action={
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCw className={cn(refresh.isPending && 'animate-[spin_0.9s_linear_infinite]')} />}
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <Card className="space-y-4" aria-busy>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-56" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <SkeletonText lines={3} />
        </Card>
      ) : isError && !view ? (
        <Card>
          <EmptyState
            icon={<CloudOff />}
            title="Couldn't load the Shard manifest"
            description="The meta repository could not be reached."
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : !manifest || !latest ? (
        <Card>
          <EmptyState
            icon={<Gem />}
            title="Shard client builds aren't published yet"
            description="Instances run as Fabric + Shard Core until the first build ships."
          />
          {view?.error && <p className="selectable -mt-6 pb-4 text-center text-xs text-fg-subtle">{view.error}</p>}
        </Card>
      ) : (
        <>
          <LatestBuildCard build={latest} source={view?.source ?? 'none'} fetchedAt={view?.fetchedAt ?? null} />
          <InstalledClients latestVersion={latest.version} />
          <div>
            <SectionHeader size="sm" title="Version history" />
            <div className="mt-2 space-y-2">
              {builds.map((build) => {
                const open = historyOpen === build.version
                return (
                  <Collapsible
                    key={build.version}
                    open={open}
                    onToggle={() => setHistoryOpen(open ? null : build.version)}
                    header={
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-fg">{build.version}</span>
                        {build.version === manifest.latest && (
                          <Badge tone="accent" size="sm">
                            Latest
                          </Badge>
                        )}
                        <span className="text-xs text-fg-muted">
                          {build.minecraft.length === 1 ? `Minecraft ${build.minecraft[0]}` : `${build.minecraft.length} Minecraft versions`}
                        </span>
                        <span className="ml-auto text-xs tabular-nums text-fg-subtle">{formatDate(build.releasedAt)}</span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      <MinecraftVersions versions={build.minecraft} />
                      {build.changelog.trim() ? <Markdown compact>{build.changelog}</Markdown> : <p className="text-xs text-fg-subtle">No changelog for this build.</p>}
                    </div>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
