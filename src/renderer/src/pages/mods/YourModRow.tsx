import {
  Download,
  EllipsisVertical,
  ExternalLink,
  FolderOpen,
  Trash,
  TriangleAlert
} from 'lucide-react'
import { formatBytes } from '@shared/format'
import { type InstalledMod } from '@shared/types'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown'
import { Switch } from '@/components/ui/Switch'
import { Tooltip } from '@/components/ui/Tooltip'
import { BusyGuard } from '@/components/mods/BusyGuard'
import { ModIcon } from '@/components/mods/ModIcon'
import { modrinthModUrl } from './mods-utils'

export interface YourModRowProps {
  mod: InstalledMod
  conflict: string | null
  busy: boolean
  pending: boolean
  onToggle: (enabled: boolean) => void
  onUpdate: () => void
  onOpenFile: () => void
  onRemove: () => void
}

export function YourModRow({
  mod,
  conflict,
  busy,
  pending,
  onToggle,
  onUpdate,
  onOpenFile,
  onRemove
}: YourModRowProps) {
  const version = mod.version ?? mod.modrinth?.versionNumber ?? null
  const meta = [
    version,
    mod.modrinth?.author ? `by ${mod.modrinth.author}` : null,
    formatBytes(mod.sizeBytes)
  ]
    .filter((s): s is string => !!s)
    .join(' · ')

  const items: DropdownItem[] = [
    ...(mod.update
      ? [
          {
            label: `Update to ${mod.update.versionNumber}`,
            icon: <Download />,
            onSelect: onUpdate,
            disabled: busy
          } satisfies DropdownItem
        ]
      : []),
    { label: 'Open file', icon: <FolderOpen />, onSelect: onOpenFile },
    ...(mod.modrinth?.slug
      ? [
          {
            label: 'View on Modrinth',
            icon: <ExternalLink />,
            onSelect: () => openExternal(modrinthModUrl(mod.modrinth!.slug!))
          } satisfies DropdownItem
        ]
      : []),
    'separator',
    {
      label: 'Remove',
      icon: <Trash />,
      danger: true,
      onSelect: onRemove,
      disabled: busy || mod.locked
    }
  ]

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', !mod.enabled && 'opacity-70')}>
      <ModIcon src={mod.modrinth?.iconUrl} name={mod.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{mod.name}</span>
          <Badge tone={mod.source === 'modrinth' ? 'info' : 'neutral'} size="sm">
            {mod.source === 'modrinth' ? 'Modrinth' : 'Local'}
          </Badge>
          {mod.update && (
            <Badge tone="success" size="sm" icon={<Download />}>
              Update {mod.update.versionNumber}
            </Badge>
          )}
          {conflict && (
            <Tooltip content={conflict}>
              <span className="inline-flex">
                <Badge tone="danger" size="sm" icon={<TriangleAlert />}>
                  Conflict
                </Badge>
              </span>
            </Tooltip>
          )}
          {!mod.enabled && (
            <Badge tone="outline" size="sm">
              Disabled
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-fg-muted">{meta}</div>
      </div>

      <BusyGuard busy={busy}>
        <Switch
          size="sm"
          checked={mod.enabled}
          disabled={busy || pending}
          onCheckedChange={onToggle}
        />
      </BusyGuard>

      <Dropdown
        items={items}
        trigger={
          <IconButton label={`${mod.name} actions`} size="sm">
            <EllipsisVertical />
          </IconButton>
        }
      />
    </div>
  )
}
