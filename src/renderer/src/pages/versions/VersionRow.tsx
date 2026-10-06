import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Download, Layers, Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { formatBytes, formatDate } from '@shared/format'
import { type InstanceSummary, type LaunchProgress, type VersionEntry, type VersionState } from '@shared/types'
import { cn } from '@/lib/cn'
import { useLaunch } from '@/stores/launch'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dropdown } from '@/components/ui/Dropdown'
import { Progress } from '@/components/ui/Progress'
import { Tooltip } from '@/components/ui/Tooltip'
import { InstanceRow } from '@/components/instances/InstanceRow'
import { NameDialog } from '@/components/instances/NameDialog'
import { findActiveInstall, useCancelPrepare, useCreateInstance, useInstallVersion } from './useVersions'

const CLIENT_PENDING_TIP =
  'Shard client build for this version is not published yet. You can still play with Fabric and the bundled mods.'

function StateBadge({ state }: { state: VersionState }) {
  if (state === 'ready') {
    return (
      <Badge tone="success" dot>
        Ready
      </Badge>
    )
  }
  if (state === 'client-pending') {
    return (
      <Tooltip content={CLIENT_PENDING_TIP}>
        <span className="inline-flex rounded-full" tabIndex={0}>
          <Badge tone="warning" dot>
            Client pending
          </Badge>
        </span>
      </Tooltip>
    )
  }
  return <Badge tone="outline">Not installed</Badge>
}

function InstallProgress({ progress, onCancel, cancelling }: { progress: LaunchProgress; onCancel: () => void; cancelling: boolean }) {
  const download = progress.download
  const pct = download && download.totalBytes > 0 ? (download.doneBytes / download.totalBytes) * 100 : null
  const activeStep = progress.steps.find((s) => s.status === 'active')
  return (
    <div className="flex w-[300px] items-center gap-2" role="status" aria-live="polite">
      <div className="min-w-0 flex-1">
        <div className="mb-1 truncate text-[11px] text-fg-muted">
          {progress.mode === 'repair' ? 'Repairing' : 'Installing'} · {activeStep?.detail ?? activeStep?.label ?? progress.message ?? 'Starting…'}
        </div>
        <Progress value={pct} size="xs" striped={pct !== null} label="Install progress" />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">{pct !== null ? `${Math.round(pct)}%` : '…'}</span>
      <IconButton label="Cancel installation" size="xs" onClick={onCancel} disabled={cancelling}>
        <X />
      </IconButton>
    </div>
  )
}

function InstallSplit({ version }: { version: string }) {
  const install = useInstallVersion()
  return (
    <div className="inline-flex items-stretch">
      <Button
        size="sm"
        variant="primary"
        className="rounded-r-none"
        leftIcon={<Download />}
        onClick={() => install.mutate({ minecraftVersion: version, type: 'shard' })}
        loading={install.isPending}
      >
        Install
      </Button>
      <Dropdown
        width={248}
        items={[
          {
            label: 'Install as Vanilla (testing)',
            icon: <Layers />,
            hint: 'No Fabric, mods or client',
            onSelect: () => install.mutate({ minecraftVersion: version, type: 'vanilla' })
          }
        ]}
        trigger={
          <button
            type="button"
            aria-label={`More install options for ${version}`}
            disabled={install.isPending}
            className="press flex h-8 w-8 items-center justify-center rounded-r-[9px] border-l border-black/15 bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <ChevronDown className="size-4" />
          </button>
        }
      />
    </div>
  )
}

export interface VersionRowProps {
  entry: VersionEntry
  instances: InstanceSummary[]
}

/** One Minecraft version with its state, install controls and (when installed) its instances. */
export function VersionRow({ entry, instances }: VersionRowProps) {
  const byInstance = useLaunch((s) => s.byInstance)
  const cancel = useCancelPrepare()
  const create = useCreateInstance()
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const closeAdd = useCallback(() => setAddOpen(false), [])

  const installed = entry.state !== 'not-installed' || instances.length > 0
  const activeInstall = findActiveInstall(
    instances.map((i) => i.id),
    byInstance
  )
  const running = instances.some((i) => i.running)

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
      <Card padding="none" className={cn('overflow-hidden', running && 'border-success/30')}>
        <div className="flex items-center gap-3 px-3.5 py-3">
          {installed ? (
            <IconButton label={expanded ? 'Hide instances' : 'Show instances'} size="sm" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              <ChevronRight className={cn('transition-transform duration-200', expanded && 'rotate-90')} />
            </IconButton>
          ) : (
            <span className="size-8 shrink-0" aria-hidden />
          )}
          <Tooltip content={entry.clientAvailable ? 'Shard client build available' : 'Shard client build pending'}>
            <span
              role="img"
              aria-label={entry.clientAvailable ? 'Shard client available' : 'Shard client pending'}
              tabIndex={0}
              className={cn(
                'size-2 shrink-0 rounded-full',
                entry.clientAvailable ? 'bg-success shadow-[0_0_8px_rgb(52_211_153/0.8)]' : 'bg-warning/70'
              )}
            />
          </Tooltip>
          <span className="min-w-[84px] font-mono text-[15px] font-semibold tracking-tight text-fg">{entry.id}</span>
          <Badge tone={entry.kind === 'release' ? 'neutral' : 'info'} size="sm">
            {entry.kind === 'release' ? 'Release' : 'Snapshot'}
          </Badge>
          {entry.latest && (
            <Badge tone="accent" size="sm" icon={<Sparkles />}>
              Latest
            </Badge>
          )}
          <span className="text-xs tabular-nums text-fg-muted">{formatDate(entry.releaseTime)}</span>

          <div className="ml-auto flex items-center gap-3">
            {installed && entry.diskUsageBytes !== null && (
              <span className="text-xs tabular-nums text-fg-subtle">{formatBytes(entry.diskUsageBytes)}</span>
            )}
            {installed && instances.length > 1 && (
              <span className="text-xs text-fg-subtle">
                {instances.length} instances
              </span>
            )}
            <StateBadge state={entry.state} />
            {activeInstall ? (
              <InstallProgress
                progress={activeInstall}
                onCancel={() => cancel.mutate(activeInstall.instanceId)}
                cancelling={cancel.isPending}
              />
            ) : installed ? (
              <Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setAddOpen(true)}>
                Add instance
              </Button>
            ) : (
              <InstallSplit version={entry.id} />
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && installed && (
            <motion.div
              key="instances"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-2 border-t border-line bg-black/15 px-3.5 py-3">
                {instances.length === 0 ? (
                  <div className="py-2 text-center text-xs text-fg-subtle">No instances for this version.</div>
                ) : (
                  <AnimatePresence initial={false}>
                    {instances.map((instance) => (
                      <InstanceRow key={instance.id} instance={instance} />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <NameDialog
        open={addOpen}
        onClose={closeAdd}
        title={`New instance for ${entry.id}`}
        description="Instances share downloaded libraries and assets, so a second one costs little disk space."
        initialName={instances.length === 0 ? `Shard ${entry.id}` : `${entry.id} #${instances.length + 1}`}
        confirmLabel="Create"
        withType
        takenNames={instances.map((i) => i.name)}
        onSubmit={async ({ name, type }) => {
          await create.mutateAsync({ name, minecraftVersion: entry.id, type })
        }}
      />
    </motion.div>
  )
}
