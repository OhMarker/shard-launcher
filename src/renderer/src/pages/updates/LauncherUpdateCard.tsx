import { CircleAlert, CircleCheck, Download, ExternalLink, Info, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import { type ReactNode } from 'react'
import { formatBytes, formatRelative, formatSpeed } from '@shared/format'
import { type LauncherUpdateState, type UpdateChannel } from '@shared/types'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { RELEASES_URL } from '@/pages/settings/links'
import { useSettingsUpdate } from '@/pages/settings/useSettingsUpdate'
import { Markdown } from './Markdown'
import { excerptMarkdown } from './release-notes'
import { useUpdateActions, useUpdateState } from './useUpdates'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'info'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-line bg-white/4',
  accent: 'border-accent/30 bg-accent/8',
  success: 'border-success/30 bg-success/8',
  danger: 'border-danger/30 bg-danger/8',
  info: 'border-info/30 bg-info/8'
}

const TONE_ICON: Record<Tone, string> = {
  neutral: 'bg-white/8 text-fg-muted',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info'
}

function StatusPanel({ tone, icon, title, children, actions }: { tone: Tone; icon: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cn('rounded-[14px] border p-4', TONE_CLASS[tone])} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-[18px]', TONE_ICON[tone])} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{title}</div>
          {children && <div className="mt-1 text-[13px] text-fg-muted">{children}</div>}
        </div>
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">{actions}</div>}
    </div>
  )
}

function Status({ state }: { state: LauncherUpdateState }) {
  const { check, download, install } = useUpdateActions()
  const checkButton = (label: string, variant: 'primary' | 'secondary' = 'secondary') => (
    <Button size="sm" variant={variant} leftIcon={<RefreshCw />} onClick={() => check.mutate()} loading={check.isPending || state.status === 'checking'}>
      {label}
    </Button>
  )
  const lastChecked = state.lastCheckedAt ? `Last checked ${formatRelative(state.lastCheckedAt)}.` : null

  switch (state.status) {
    case 'unsupported':
      return (
        <StatusPanel
          tone="info"
          icon={<Info />}
          title="Automatic updates are off in this build"
          actions={
            <Button size="sm" variant="outline" rightIcon={<ExternalLink />} onClick={() => openExternal(RELEASES_URL)}>
              Open releases on GitHub
            </Button>
          }
        >
          Updates are delivered through GitHub Releases in packaged builds. You are running from source or an unpackaged build.
        </StatusPanel>
      )
    case 'idle':
      return (
        <StatusPanel tone="neutral" icon={<RefreshCw />} title="Not checked yet" actions={checkButton('Check now', 'primary')}>
          Shard checks for updates on start. {lastChecked}
        </StatusPanel>
      )
    case 'checking':
      return (
        <StatusPanel tone="accent" icon={<RefreshCw className="animate-[spin_0.9s_linear_infinite]" />} title="Checking for updates…" actions={checkButton('Checking')}>
          <Progress value={null} size="xs" className="mt-2 max-w-xs" label="Checking for updates" />
        </StatusPanel>
      )
    case 'up-to-date':
      return (
        <StatusPanel tone="success" icon={<CircleCheck />} title="You're up to date" actions={checkButton('Check again')}>
          Shard {state.currentVersion} is the newest {state.channel} release. {lastChecked}
        </StatusPanel>
      )
    case 'available': {
      const excerpt = state.releaseNotes ? excerptMarkdown(state.releaseNotes, 5, 360) : null
      return (
        <StatusPanel
          tone="accent"
          icon={<Sparkles />}
          title={`Shard ${state.availableVersion ?? ''} is available`}
          actions={
            <>
              <Button size="sm" variant="primary" leftIcon={<Download />} onClick={() => download.mutate()} loading={download.isPending}>
                Download
              </Button>
              {checkButton('Check again')}
            </>
          }
        >
          {excerpt?.text ? <Markdown compact>{excerpt.text}</Markdown> : 'Download it now and restart when it is ready.'}
        </StatusPanel>
      )
    }
    case 'downloading': {
      const p = state.progress
      return (
        <StatusPanel tone="accent" icon={<Download />} title={`Downloading Shard ${state.availableVersion ?? ''}`}>
          <div className="mt-2 space-y-1.5">
            <Progress value={p ? p.percent : null} size="sm" striped label="Update download" />
            <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-fg-subtle">
              <span>{p ? `${formatBytes(p.transferred)} / ${formatBytes(p.total)}` : 'Starting…'}</span>
              <span>{p ? `${Math.round(p.percent)}% · ${formatSpeed(p.bytesPerSecond)}` : ''}</span>
            </div>
          </div>
        </StatusPanel>
      )
    }
    case 'downloaded':
      return (
        <StatusPanel
          tone="success"
          icon={<CircleCheck />}
          title={`Shard ${state.availableVersion ?? ''} is ready to install`}
          actions={
            <Button size="sm" variant="primary" leftIcon={<RotateCcw />} onClick={() => install.mutate()} loading={install.isPending}>
              Restart to update
            </Button>
          }
        >
          The launcher restarts and applies the update. Running games are not affected.
        </StatusPanel>
      )
    case 'error':
      return (
        <StatusPanel tone="danger" icon={<CircleAlert />} title="Update failed" actions={checkButton('Try again')}>
          <span className="selectable break-words">{state.error ?? 'Something went wrong while checking for updates.'}</span>
        </StatusPanel>
      )
  }
}

/** Current version, channel picker and the live update status. */
export function LauncherUpdateCard() {
  const { data: state, isLoading } = useUpdateState()
  const { data: info } = useSystemInfo()
  const channel = useSettings((s) => s.settings.updateChannel)
  const update = useSettingsUpdate()
  const setWhatsNewOpen = useUi((s) => s.setWhatsNewOpen)
  const version = state?.currentVersion ?? info?.launcherVersion

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Current version</div>
          <div className="mt-0.5 flex items-center gap-2">
            {version ? <span className="font-mono text-2xl font-semibold text-fg">{version}</span> : <Skeleton className="h-8 w-24" />}
            {state?.channel === 'beta' && <Badge tone="info">Beta</Badge>}
            {info && !info.isPackaged && (
              <Badge tone="outline" size="sm">
                Development build
              </Badge>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" leftIcon={<Sparkles />} onClick={() => setWhatsNewOpen(true)}>
          What&apos;s new
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-fg">Update channel</div>
          <div className="text-xs text-fg-muted">Beta receives pre-releases as soon as they are tagged.</div>
        </div>
        <Tabs<UpdateChannel>
          size="sm"
          value={channel}
          onChange={(updateChannel) => void update({ updateChannel })}
          items={[
            { value: 'stable', label: 'Stable' },
            { value: 'beta', label: 'Beta' }
          ]}
        />
      </div>

      {isLoading || !state ? (
        <div className="rounded-[14px] border border-line bg-white/4 p-4" aria-busy>
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 rounded-[10px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      ) : (
        <Status state={state} />
      )}
    </Card>
  )
}
