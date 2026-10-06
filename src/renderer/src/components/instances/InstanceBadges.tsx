import { Gem, Hourglass, Play } from 'lucide-react'
import { type InstanceType } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'

export function InstanceTypeBadge({ type, size = 'sm' }: { type: InstanceType; size?: 'sm' | 'md' }) {
  return type === 'shard' ? (
    <Badge tone="accent" size={size} icon={<Gem />}>
      Shard
    </Badge>
  ) : (
    <Badge tone="outline" size={size}>
      Vanilla
    </Badge>
  )
}

/** Installed Shard client build, or the "Client pending" state when none is published yet. */
export function ShardBuildBadge({
  type,
  shardBuild,
  size = 'sm'
}: {
  type: InstanceType
  shardBuild: string | null
  size?: 'sm' | 'md'
}) {
  if (type !== 'shard') return null
  if (shardBuild) {
    return (
      <Badge tone="success" size={size} dot>
        <span className="font-mono">{shardBuild}</span>
      </Badge>
    )
  }
  // Tooltip attaches a ref to its child, so the badge is wrapped in a focusable span.
  return (
    <Tooltip content="The Shard client build for this version is not published yet. You can still play with Fabric and the bundled mods.">
      <span className="inline-flex rounded-full" tabIndex={0}>
        <Badge tone="warning" size={size} icon={<Hourglass />}>
          Client pending
        </Badge>
      </span>
    </Tooltip>
  )
}

export function RunningBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <Badge tone="success" size={size} icon={<Play className="fill-current" />}>
      Running
    </Badge>
  )
}
