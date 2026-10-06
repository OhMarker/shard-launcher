import { Clock, EllipsisVertical, ExternalLink, FolderOpen, Lock } from 'lucide-react'
import { formatBytes } from '@shared/format'
import { type BundledModStatus } from '@shared/types'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Switch } from '@/components/ui/Switch'
import { Tooltip } from '@/components/ui/Tooltip'
import { BusyGuard } from '@/components/mods/BusyGuard'
import { ModIcon } from '@/components/mods/ModIcon'
import { modrinthModUrl } from './mods-utils'

export interface CoreModRowProps {
  entry: BundledModStatus
  minecraftVersion: string
  busy: boolean
  pending: boolean
  onToggle: (enabled: boolean) => void
  onOpenFile: (fileName: string) => void
}

export function CoreModRow({
  entry,
  minecraftVersion,
  busy,
  pending,
  onToggle,
  onOpenFile
}: CoreModRowProps) {
  const { def, state, installed } = entry
  const version = installed?.version ?? installed?.modrinth?.versionNumber ?? null
  const toggleable = state === 'installed' || state === 'disabled'

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', state === 'disabled' && 'opacity-70')}>
      <ModIcon src={installed?.modrinth?.iconUrl} name={def.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{def.name}</span>
          {def.required && (
            <Badge tone="outline" size="sm" icon={<Lock />}>
              Required
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-fg-muted">{def.description}</div>
      </div>

      <div className="w-[96px] shrink-0 text-right text-xs text-fg-subtle">
        {version && <div className="truncate font-mono text-fg-muted">{version}</div>}
        {installed && <div>{formatBytes(installed.sizeBytes)}</div>}
      </div>

      <div className="flex w-[160px] shrink-0 items-center justify-end">
        {toggleable && def.required && (
          <Tooltip
            content={`${def.name} is required by every Shard Core mod and cannot be disabled.`}
          >
            <span className="inline-flex">
              <Switch size="sm" checked disabled onCheckedChange={() => undefined} />
            </span>
          </Tooltip>
        )}
        {toggleable && !def.required && (
          <BusyGuard busy={busy}>
            <Switch
              size="sm"
              checked={state === 'installed'}
              disabled={busy || pending}
              onCheckedChange={onToggle}
            />
          </BusyGuard>
        )}
        {state === 'waiting' && (
          <Tooltip
            content={`No build for Minecraft ${minecraftVersion} yet. Shard checks again on every launch.`}
          >
            <span className="inline-flex">
              <Badge tone="warning" size="sm" icon={<Clock />}>
                Waiting for {def.name} update
              </Badge>
            </span>
          </Tooltip>
        )}
        {state === 'not-installed' && (
          <span className="text-xs text-fg-subtle">Installs on next launch</span>
        )}
      </div>

      <Dropdown
        items={[
          {
            label: 'Open file',
            icon: <FolderOpen />,
            disabled: !installed,
            onSelect: () => {
              if (installed) onOpenFile(installed.fileName)
            }
          },
          {
            label: 'View on Modrinth',
            icon: <ExternalLink />,
            onSelect: () => openExternal(modrinthModUrl(def.slug))
          }
        ]}
        trigger={
          <IconButton label={`${def.name} actions`} size="sm">
            <EllipsisVertical />
          </IconButton>
        }
      />
    </div>
  )
}
