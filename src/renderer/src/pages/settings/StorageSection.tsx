import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eraser, FolderInput, FolderOpen, HardDrive, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { formatBytes } from '@shared/format'
import { type MigrationProgress } from '@shared/types'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle, invoke, queryKeys, useIpcEvent } from '@/lib/api'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { Dialog } from '@/components/ui/Dialog'
import { InlineCode } from '@/components/ui/Misc'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingRow, SettingsSection } from './SettingsSection'

const PHASE_LABEL: Record<MigrationProgress['phase'], string> = {
  copying: 'Copying files',
  verifying: 'Verifying copies',
  cleaning: 'Removing the old copies',
  done: 'Done'
}

const noop = (): void => undefined

function MigrationDialog({ open, target, progress }: { open: boolean; target: string | null; progress: MigrationProgress | null }) {
  const pct = progress && progress.totalBytes > 0 ? (progress.copiedBytes / progress.totalBytes) * 100 : null
  return (
    <Dialog open={open} onClose={noop} blocking title="Moving Shard data" description="Keep the launcher open until this finishes." size="sm">
      <div className="space-y-3">
        <div className="text-sm text-fg">{progress ? PHASE_LABEL[progress.phase] : 'Preparing…'}</div>
        <Progress value={progress?.phase === 'done' ? 100 : pct} size="md" striped={pct !== null} label="Migration progress" />
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-fg-subtle">
          <span>{progress ? `${formatBytes(progress.copiedBytes)} / ${formatBytes(progress.totalBytes)}` : '…'}</span>
          <span>{pct !== null ? `${Math.round(pct)}%` : ''}</span>
        </div>
        {progress?.currentFile && (
          <div className="truncate font-mono text-[11px] text-fg-subtle" title={progress.currentFile}>
            {progress.currentFile}
          </div>
        )}
        {target && (
          <div className="text-xs text-fg-muted">
            New location: <InlineCode>{target}</InlineCode>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function StorageSection() {
  const { data: info } = useSystemInfo()
  const dataDir = useSettings((s) => s.settings.dataDir)
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const [migration, setMigration] = useState<MigrationProgress | null>(null)
  useIpcEvent('settings:migrationProgress', setMigration)

  const currentDir = dataDir ?? info?.dataDir ?? null
  const fail = (err: unknown): void => {
    toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  }

  const migrate = useMutation({
    mutationFn: (target: string) => invoke('settings:migrateDataDir', { target }),
    onSuccess: (_settings, target) => {
      void qc.invalidateQueries({ queryKey: queryKeys.info })
      void qc.invalidateQueries({ queryKey: queryKeys.instances })
      toast({ kind: 'success', title: 'Data folder moved', message: target })
    },
    onError: fail
  })

  const clearCache = useMutation({
    mutationFn: () => invoke('app:clearCache'),
    onSuccess: ({ freedBytes }) => toast({ kind: 'success', title: 'Cache cleared', message: `Freed ${formatBytes(freedBytes)}.` }),
    onError: fail
  })

  const changeDir = async (): Promise<void> => {
    let picked: string | null = null
    try {
      picked = await invoke('app:pickDirectory', { title: 'Choose a new folder for Shard data' })
    } catch (err) {
      fail(err)
      return
    }
    if (!picked || picked === currentDir) return
    const ok = await confirm({
      title: 'Move Shard data?',
      message: (
        <div className="space-y-2">
          <p>
            Instances, worlds, libraries, assets and Java runtimes are copied to <InlineCode>{picked}</InlineCode>, verified, and the old
            copies are removed.
          </p>
          <p>This can take a while on a large library. Make sure no game is running and keep the launcher open until it finishes.</p>
        </div>
      ),
      confirmLabel: 'Move data'
    })
    if (!ok) return
    setMigration(null)
    migrate.mutate(picked)
  }

  return (
    <SettingsSection id="storage" title="Storage" description="Where the heavy files live, and how to reclaim space." icon={<HardDrive />}>
      <SettingRow
        label="Data folder"
        description="Instances, libraries, assets and Java runtimes. Settings, accounts and logs always stay in the default location so Shard can find them."
        stacked
      >
        <div className="flex items-center gap-2">
          <div className="selectable min-w-0 flex-1 truncate rounded-[10px] border border-line bg-white/4 px-3 py-2 font-mono text-[12.5px] text-fg-muted" title={currentDir ?? undefined}>
            {currentDir ?? <Skeleton className="h-4 w-64" />}
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<FolderOpen />}
            disabled={!currentDir}
            onClick={() => {
              if (currentDir) void invoke('app:openPath', { path: currentDir }).catch(fail)
            }}
          >
            Open
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<FolderInput />} disabled={!currentDir || migrate.isPending} onClick={() => void changeDir()}>
            Change…
          </Button>
        </div>
      </SettingRow>
      <SettingRow label="Cache" description="Downloaded manifests, Modrinth responses and skin textures. Safe to clear at any time; it refills on demand.">
        <Button size="sm" variant="secondary" leftIcon={<Eraser />} onClick={() => clearCache.mutate()} loading={clearCache.isPending}>
          Clear cache
        </Button>
      </SettingRow>
      <SettingRow label="Logs" description="Launcher logs are the first thing to attach to a bug report. Tokens are scrubbed before they are written.">
        <Button size="sm" variant="secondary" leftIcon={<ScrollText />} onClick={() => void invoke('app:openLogs').catch(fail)}>
          Open logs
        </Button>
      </SettingRow>
      <MigrationDialog open={migrate.isPending} target={migrate.variables ?? null} progress={migration} />
    </SettingsSection>
  )
}
