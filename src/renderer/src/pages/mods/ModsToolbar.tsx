import {
  Copy,
  Download,
  EllipsisVertical,
  FileUp,
  FolderOpen,
  Layers,
  RefreshCw,
  Search
} from 'lucide-react'
import { type InstanceSummary } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Select } from '@/components/ui/Select'
import { BusyGuard } from '@/components/mods/BusyGuard'
import { instanceLabel } from './mods-utils'

export interface ModsToolbarProps {
  instances: InstanceSummary[]
  instance: InstanceSummary
  onSelectInstance: (id: string) => void
  /** Instance is preparing or running: mutations are blocked. */
  busy: boolean
  updates: number
  checking: boolean
  updating: boolean
  onBrowse: () => void
  onCheckUpdates: () => void
  onUpdateAll: () => void
  onImport: () => void
  onCopyTo: () => void
  onOpenFolder: () => void
}

export function ModsToolbar({
  instances,
  instance,
  onSelectInstance,
  busy,
  updates,
  checking,
  updating,
  onBrowse,
  onCheckUpdates,
  onUpdateAll,
  onImport,
  onCopyTo,
  onOpenFolder
}: ModsToolbarProps) {
  const options = instances.map((i) => ({ value: i.id, label: instanceLabel(i) }))
  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3">
      <Select
        value={instance.id}
        onChange={onSelectInstance}
        options={options}
        className="w-[260px]"
        aria-label="Instance"
      />
      <Badge tone="neutral" icon={<Layers />}>
        {instance.minecraftVersion}
      </Badge>
      <Badge tone={instance.type === 'shard' ? 'accent' : 'outline'}>
        {instance.type === 'shard' ? 'Shard' : 'Vanilla'}
      </Badge>
      {busy && (
        <Badge tone="success" dot>
          Running
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-2">
        <BusyGuard busy={busy}>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<RefreshCw />}
            loading={checking}
            disabled={busy}
            onClick={onCheckUpdates}
          >
            Check for updates
          </Button>
        </BusyGuard>
        <BusyGuard busy={busy}>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Download />}
            loading={updating}
            disabled={busy || updates === 0}
            onClick={onUpdateAll}
            aria-label={updates > 0 ? `Update all, ${updates} available` : 'Update all'}
          >
            Update all
            {updates > 0 && (
              <span className="rounded-full bg-accent/20 px-1.5 text-[11px] font-semibold tabular-nums text-accent">
                {updates}
              </span>
            )}
          </Button>
        </BusyGuard>
        <Dropdown
          width={240}
          items={[
            {
              label: 'Import jar or mrpack…',
              icon: <FileUp />,
              onSelect: onImport,
              disabled: busy
            },
            { label: 'Copy my mods to…', icon: <Copy />, onSelect: onCopyTo, disabled: busy },
            'separator',
            { label: 'Open mods folder', icon: <FolderOpen />, onSelect: onOpenFolder }
          ]}
          trigger={
            <IconButton label="More actions" size="sm" variant="secondary">
              <EllipsisVertical />
            </IconButton>
          }
        />
        <Button size="sm" variant="primary" leftIcon={<Search />} onClick={onBrowse}>
          Browse Modrinth
        </Button>
      </div>
    </div>
  )
}
