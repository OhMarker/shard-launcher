import { useMutation } from '@tanstack/react-query'
import { Bug, Code, ExternalLink, Info, RotateCcw } from 'lucide-react'
import { type ReactNode } from 'react'
import { TAGLINE } from '@shared/constants'
import { formatMemory } from '@shared/format'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle, invoke, openExternal } from '@/lib/api'
import { useUi } from '@/stores/ui'
import { LicenseLink } from '@/components/brand/Credits'
import { CREDIT_LINE, LICENSE_NAME } from '@/lib/credits'
import { ShardMark } from '@/components/brand/Logo'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { Skeleton } from '@/components/ui/Skeleton'
import { ISSUES_URL, REPO_URL } from './links'
import { SettingRow, SettingsSection } from './SettingsSection'

const PLATFORM_LABEL: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="selectable mt-0.5 truncate font-mono text-[13px] text-fg">{value}</dd>
    </div>
  )
}

export function AboutSection() {
  const { data: info } = useSystemInfo()
  const toast = useUi((s) => s.toast)
  const versions = window.shard.versions

  const reset = useMutation({
    mutationFn: () => invoke('app:resetLauncher'),
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })

  const onReset = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Reset Shard Launcher?',
      message:
        'All launcher settings, signed-in accounts and cached data are removed and Shard restarts as if freshly installed. This cannot be undone.',
      confirmLabel: 'Reset launcher',
      danger: true
    })
    if (ok) reset.mutate()
  }

  return (
    <SettingsSection id="about" title="About" description={TAGLINE} icon={<Info />}>
      <SettingRow label="Shard Launcher" description="Open source, MIT licensed.">
        <div className="flex items-center gap-3">
          <ShardMark size={28} />
          {info ? <span className="font-mono text-lg font-semibold text-fg">{info.launcherVersion}</span> : <Skeleton className="h-6 w-16" />}
          {info && (
            <Badge tone={info.isPackaged ? 'neutral' : 'outline'} size="sm">
              {info.isPackaged ? 'Packaged' : 'Development'}
            </Badge>
          )}
        </div>
      </SettingRow>
      <SettingRow label="Runtime" description="Useful when reporting a problem." stacked>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
          <Fact label="Electron" value={versions.electron} />
          <Fact label="Chrome" value={versions.chrome} />
          <Fact label="Node" value={versions.node} />
          <Fact label="Platform" value={info ? `${PLATFORM_LABEL[info.platform] ?? info.platform} · ${info.arch}` : '…'} />
          <Fact label="CPU" value={info ? `${info.cpuCount} cores` : '…'} />
          <Fact label="Memory" value={info ? formatMemory(info.totalMemoryMb) : '…'} />
        </dl>
      </SettingRow>
      <SettingRow label="Links">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Code />} rightIcon={<ExternalLink />} onClick={() => openExternal(REPO_URL)}>
            GitHub
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Bug />} rightIcon={<ExternalLink />} onClick={() => openExternal(ISSUES_URL)}>
            Report an issue
          </Button>
        </div>
      </SettingRow>
      <SettingRow label="Credits" description={CREDIT_LINE}>
        <LicenseLink label={`View ${LICENSE_NAME}`} className="text-[13px] text-fg-subtle" />
      </SettingRow>
      <SettingRow label="Reset launcher" description="Wipe settings, accounts and caches and start over.">
        <Button size="sm" variant="danger" leftIcon={<RotateCcw />} onClick={() => void onReset()} loading={reset.isPending}>
          Reset launcher
        </Button>
      </SettingRow>
    </SettingsSection>
  )
}
