import { motion } from 'framer-motion'
import {
  Copy,
  Ellipsis,
  FolderOpen,
  Gem,
  Layers,
  Pencil,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Star,
  Trash,
  Wrench
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { formatBytes, formatDuration, formatRelative } from '@shared/format'
import { type InstanceSummary } from '@shared/types'
import { useInstances } from '@/hooks/useInstances'
import { cn } from '@/lib/cn'
import { useLaunchState } from '@/stores/launch'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown'
import { Progress } from '@/components/ui/Progress'
import { InstanceTypeBadge, RunningBadge, ShardBuildBadge } from './InstanceBadges'
import { InstanceSettingsDialog } from './InstanceSettingsDialog'
import { NameDialog } from './NameDialog'
import { useInstanceActions } from './useInstanceActions'

type RowDialog = 'rename' | 'duplicate' | 'settings' | null

export interface InstanceRowProps {
  instance: InstanceSummary
  className?: string
}

/** One instance with its launch button and the full action menu. */
export function InstanceRow({ instance, className }: InstanceRowProps) {
  const progress = useLaunchState(instance.id)
  const actions = useInstanceActions(instance)
  const { data: allInstances } = useInstances()
  const [dialog, setDialog] = useState<RowDialog>(null)
  // Stable so Dialog's focus-management effect does not re-run on every progress event.
  const closeDialog = useCallback(() => setDialog(null), [])

  const preparing = progress?.phase === 'preparing'
  const running = instance.running || progress?.phase === 'running'
  const activeStep = progress?.steps.find((s) => s.status === 'active')
  const download = progress?.download
  const pct = download && download.totalBytes > 0 ? (download.doneBytes / download.totalBytes) * 100 : null
  const siblingNames = (allInstances ?? []).filter((i) => i.id !== instance.id).map((i) => i.name)

  const menu: DropdownItem[] = [
    { label: 'Rename', icon: <Pencil />, onSelect: () => setDialog('rename'), disabled: running },
    { label: 'Duplicate', icon: <Copy />, onSelect: () => setDialog('duplicate') },
    { label: 'Open folder', icon: <FolderOpen />, onSelect: actions.openFolder },
    { label: 'Settings', icon: <Settings2 />, onSelect: () => setDialog('settings') },
    'separator',
    { label: 'Repair', icon: <Wrench />, onSelect: actions.repair, disabled: preparing || running, hint: 'Verify files' },
    ...(instance.type === 'shard'
      ? [
          {
            label: 'Reinstall Shard client',
            icon: <RefreshCw />,
            onSelect: actions.reinstallClient,
            disabled: preparing || running
          } satisfies DropdownItem
        ]
      : []),
    {
      label: actions.isDefault ? 'Default instance' : 'Set as default',
      icon: <Star />,
      checked: actions.isDefault,
      onSelect: actions.setDefault
    },
    'separator',
    { label: 'Delete', icon: <Trash />, danger: true, disabled: running || preparing, onSelect: () => void actions.remove() }
  ]

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className={cn(
          'flex items-center gap-3 rounded-[12px] border border-line bg-white/4 px-3.5 py-2.5 transition-colors hover:bg-white/6',
          running && 'border-success/30',
          className
        )}
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line',
            instance.type === 'shard' ? 'bg-accent/12 text-accent' : 'bg-white/6 text-fg-muted'
          )}
          aria-hidden
        >
          {instance.type === 'shard' ? <Gem className="size-[18px]" /> : <Layers className="size-[18px]" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-fg">{instance.name}</span>
            <InstanceTypeBadge type={instance.type} />
            <ShardBuildBadge type={instance.type} shardBuild={instance.shardBuild} />
            {running && <RunningBadge />}
            {actions.isDefault && (
              <Badge tone="outline" size="sm" icon={<Star className="fill-current" />}>
                Default
              </Badge>
            )}
            {instance.installState === 'broken' && !preparing && (
              <Badge tone="danger" size="sm">
                Needs repair
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex min-h-4 items-center gap-2 text-xs text-fg-muted">
            {preparing ? (
              <>
                <span className="truncate text-accent">{activeStep?.detail ?? activeStep?.label ?? progress?.message ?? 'Preparing…'}</span>
                <Progress value={pct} size="xs" className="max-w-[160px]" striped={pct !== null} label="Preparation progress" />
              </>
            ) : (
              <span className="truncate tabular-nums">
                Last played {formatRelative(instance.lastPlayedAt)}
                {instance.playtimeMs > 0 && ` · ${formatDuration(instance.playtimeMs)} played`}
                {instance.diskUsageBytes !== null && ` · ${formatBytes(instance.diskUsageBytes)}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {running ? (
            <Button size="sm" variant="danger" leftIcon={<Square className="fill-current" />} onClick={() => void actions.kill()} loading={actions.pending.kill}>
              Kill
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Play className="fill-current" />}
              onClick={() => actions.launch({ goHome: true })}
              disabled={preparing}
              loading={actions.pending.launch}
            >
              Launch
            </Button>
          )}
          <Dropdown
            width={240}
            items={menu}
            trigger={
              <IconButton label={`More actions for ${instance.name}`} size="sm">
                <Ellipsis />
              </IconButton>
            }
          />
        </div>
      </motion.div>

      <NameDialog
        open={dialog === 'rename'}
        onClose={closeDialog}
        title="Rename instance"
        initialName={instance.name}
        confirmLabel="Rename"
        takenNames={siblingNames}
        onSubmit={({ name }) => actions.rename(name)}
      />
      <NameDialog
        open={dialog === 'duplicate'}
        onClose={closeDialog}
        title="Duplicate instance"
        description="Copies the mods, configs and settings. Worlds and screenshots are copied too."
        initialName={`${instance.name} copy`}
        confirmLabel="Duplicate"
        takenNames={siblingNames}
        onSubmit={({ name }) => actions.duplicate(name)}
      />
      <InstanceSettingsDialog instance={instance} open={dialog === 'settings'} onClose={closeDialog} />
    </>
  )
}
