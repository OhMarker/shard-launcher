import { Check, Download, Lock, TriangleAlert } from 'lucide-react'
import { type HitState } from '@/pages/mods/mods-utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { BusyGuard } from './BusyGuard'

export interface InstallStateControlProps {
  state: HitState
  conflictReason: string | null
  installing: boolean
  /** The instance is running; installs are blocked. */
  busy: boolean
  onInstall: () => void
  size?: 'xs' | 'sm' | 'md'
}

/** Install / Installed / Shard Core / Conflicts, shared by search hits and the project panel. */
export function InstallStateControl({
  state,
  conflictReason,
  installing,
  busy,
  onInstall,
  size = 'sm'
}: InstallStateControlProps) {
  switch (state) {
    case 'install':
      return (
        <BusyGuard busy={busy}>
          <Button
            size={size}
            variant="primary"
            leftIcon={<Download />}
            loading={installing}
            disabled={busy}
            onClick={onInstall}
          >
            Install
          </Button>
        </BusyGuard>
      )
    case 'installed':
      return (
        <Button size={size} variant="secondary" leftIcon={<Check />} disabled>
          Installed
        </Button>
      )
    case 'core':
      return (
        <Tooltip content="Part of Shard Core. It is installed and kept up to date automatically.">
          <span className="inline-flex">
            <Badge tone="accent" icon={<Lock />}>
              Shard Core
            </Badge>
          </span>
        </Tooltip>
      )
    case 'conflict':
      return (
        <Tooltip content={conflictReason ?? 'Known to conflict with Shard Core.'}>
          <span className="inline-flex">
            <Badge tone="danger" icon={<TriangleAlert />}>
              Conflicts
            </Badge>
          </span>
        </Tooltip>
      )
  }
}
