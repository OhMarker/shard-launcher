import { Clock3, Gem, Layers, Timer } from 'lucide-react'
import { formatDuration, formatRelative } from '@shared/format'
import { type InstanceSummary } from '@shared/types'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { InstanceTypeBadge, RunningBadge, ShardBuildBadge } from '@/components/instances/InstanceBadges'

export interface SelectedInstanceInfoProps {
  instance: InstanceSummary | null
  loading: boolean
  running: boolean
  className?: string
}

/** Name, version and play stats of the instance the LAUNCH button targets. */
export function SelectedInstanceInfo({ instance, loading, running, className }: SelectedInstanceInfoProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center gap-4', className)} aria-busy>
        <Skeleton className="size-14 rounded-[14px]" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    )
  }

  if (!instance) {
    return (
      <div className={cn('flex items-center gap-4', className)}>
        <span className="flex size-14 items-center justify-center rounded-[14px] border border-dashed border-line-strong text-fg-subtle">
          <Layers className="size-6" />
        </span>
        <div>
          <div className="text-lg font-semibold text-fg">No version installed yet</div>
          <div className="text-sm text-fg-muted">Pick a Minecraft version and Shard sets everything else up.</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-[14px] border border-line',
          instance.type === 'shard' ? 'bg-accent/12 text-accent shadow-[0_0_24px_-6px_rgb(var(--accent-rgb)/0.6)]' : 'bg-white/6 text-fg-muted'
        )}
        aria-hidden
      >
        {instance.type === 'shard' ? <Gem className="size-6" /> : <Layers className="size-6" />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xl font-semibold tracking-tight text-fg">{instance.name}</span>
          {running && <RunningBadge />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">
            <span className="font-mono">Minecraft {instance.minecraftVersion}</span>
          </Badge>
          <InstanceTypeBadge type={instance.type} size="md" />
          <ShardBuildBadge type={instance.type} shardBuild={instance.shardBuild} size="md" />
          {instance.installState === 'broken' && <Badge tone="danger">Needs repair</Badge>}
          {instance.installState === 'pending' && <Badge tone="neutral">Installs on first launch</Badge>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-fg-subtle" aria-hidden />
            Last played {formatRelative(instance.lastPlayedAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <Timer className="size-3.5 text-fg-subtle" aria-hidden />
            {instance.playtimeMs > 0 ? `${formatDuration(instance.playtimeMs)} played` : 'No playtime yet'}
          </span>
        </div>
      </div>
    </div>
  )
}
