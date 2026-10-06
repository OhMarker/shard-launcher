import { Clock, EllipsisVertical, FolderOpen, Info, Lock, RefreshCw } from 'lucide-react'
import { formatBytes } from '@shared/format'
import {
  type BundledModStatus,
  type InstanceModsView,
  type InstanceSummary,
  type ModsProgress
} from '@shared/types'
import { ShardMark } from '@/components/brand/Logo'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dropdown } from '@/components/ui/Dropdown'
import { SectionHeader } from '@/components/ui/Misc'
import { Tooltip } from '@/components/ui/Tooltip'
import { BusyGuard } from '@/components/mods/BusyGuard'
import { ModsProgressLine } from '@/components/mods/ModsProgressLine'
import { CoreModRow } from './CoreModRow'

export interface ShardCoreSectionProps {
  view: InstanceModsView
  instance: InstanceSummary
  busy: boolean
  progress: ModsProgress | null
  syncing: boolean
  onSync: () => void
  /** Slug whose enable/disable call is in flight. */
  togglingSlug: string | null
  onToggle: (entry: BundledModStatus, enabled: boolean) => void
  onOpenFile: (fileName: string) => void
}

function ShardClientRow({
  shard,
  minecraftVersion,
  onOpenFile
}: {
  shard: InstanceModsView['shard']
  minecraftVersion: string
  onOpenFile: (fileName: string) => void
}) {
  if (shard.state === 'not-applicable') return null
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-accent/30 bg-accent/10">
        <ShardMark size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">Shard client</span>
          <Badge tone="outline" size="sm" icon={<Lock />}>
            Always on
          </Badge>
        </div>
        <div className="truncate text-xs text-fg-muted">
          {shard.state === 'installed'
            ? `Crystal PvP client for Minecraft ${minecraftVersion}`
            : `Waiting for a Shard build for Minecraft ${minecraftVersion}`}
        </div>
      </div>
      <div className="w-[96px] shrink-0 text-right text-xs text-fg-subtle">
        {shard.mod?.version && (
          <div className="truncate font-mono text-fg-muted">{shard.mod.version}</div>
        )}
        {shard.mod && <div>{formatBytes(shard.mod.sizeBytes)}</div>}
      </div>
      <div className="flex w-[160px] shrink-0 justify-end">
        {shard.state === 'installed' ? (
          <Badge tone="accent" size="sm">
            Build {shard.build ?? 'unknown'}
          </Badge>
        ) : (
          <Tooltip
            content={`No Shard build for Minecraft ${minecraftVersion} yet. The launcher installs it automatically on the first launch after it ships.`}
          >
            <span className="inline-flex">
              <Badge tone="warning" size="sm" icon={<Clock />}>
                Client pending
              </Badge>
            </span>
          </Tooltip>
        )}
      </div>
      <Dropdown
        items={[
          {
            label: 'Open file',
            icon: <FolderOpen />,
            disabled: !shard.mod,
            onSelect: () => {
              if (shard.mod) onOpenFile(shard.mod.fileName)
            }
          }
        ]}
        trigger={
          <IconButton label="Shard client actions" size="sm">
            <EllipsisVertical />
          </IconButton>
        }
      />
    </div>
  )
}

export function ShardCoreSection({
  view,
  instance,
  busy,
  progress,
  syncing,
  onSync,
  togglingSlug,
  onToggle,
  onOpenFile
}: ShardCoreSectionProps) {
  const vanilla = instance.type === 'vanilla'
  return (
    <section aria-labelledby="shard-core-heading">
      <SectionHeader
        title={
          <span id="shard-core-heading" className="flex items-center gap-2">
            <Lock className="size-4 text-accent" aria-hidden />
            Shard Core
          </span>
        }
        description="Installed and updated automatically on every version. Fabric API and the Shard client cannot be disabled."
        action={
          !vanilla && (
            <BusyGuard busy={busy}>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw />}
                loading={syncing}
                disabled={busy}
                onClick={onSync}
              >
                Sync now
              </Button>
            </BusyGuard>
          )
        }
      />
      <Card padding="none" className="mt-3 overflow-hidden">
        <ModsProgressLine progress={progress} className="px-4 pt-3" />
        {vanilla ? (
          <div className="flex items-center gap-3 px-4 py-6 text-sm text-fg-muted">
            <Info className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            Vanilla instances don&apos;t include Shard Core. Install a Shard version to get the
            client and its tuned mods.
          </div>
        ) : (
          <div className="divide-y divide-line">
            <ShardClientRow
              shard={view.shard}
              minecraftVersion={view.minecraftVersion}
              onOpenFile={onOpenFile}
            />
            {view.core.map((entry) => (
              <CoreModRow
                key={entry.def.slug}
                entry={entry}
                minecraftVersion={view.minecraftVersion}
                busy={busy}
                pending={togglingSlug === entry.def.slug}
                onToggle={(enabled) => onToggle(entry, enabled)}
                onOpenFile={onOpenFile}
              />
            ))}
            {view.core.length === 0 && (
              <div className="px-4 py-6 text-sm text-fg-muted">
                No bundled mods are listed for this version yet.
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}
