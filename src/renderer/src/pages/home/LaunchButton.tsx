import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Download, Layers, LogIn, Settings, Square, Terminal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { type AccountSummary, type InstanceSummary } from '@shared/types'
import { useInstances } from '@/hooks/useInstances'
import { cn } from '@/lib/cn'
import { useLaunchState } from '@/stores/launch'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/Button'
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { InstanceTypeBadge } from '@/components/instances/InstanceBadges'
import { type InstanceActions } from '@/components/instances/useInstanceActions'

export interface LaunchButtonProps {
  instance: InstanceSummary | null
  loading: boolean
  account: AccountSummary | null
  msaConfigured: boolean
  actions: InstanceActions
  onSignIn: () => void
  className?: string
}

interface Blocker {
  reason: string
  cta: ReactNode
}

function InstanceMenuLabel({ instance }: { instance: InstanceSummary }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{instance.name}</span>
      <InstanceTypeBadge type={instance.type} />
    </span>
  )
}

/**
 * The hero LAUNCH split button: primary action on the left, instance picker on the right.
 * While the game runs the primary segment reads RUNNING and turns into KILL on hover/focus.
 */
export function LaunchButton({ instance, loading, account, msaConfigured, actions, onSignIn, className }: LaunchButtonProps) {
  const { data: instances } = useInstances()
  const navigate = useUi((s) => s.navigate)
  const selectInstance = useUi((s) => s.selectInstance)
  const setConsoleOpen = useUi((s) => s.setConsoleOpen)
  const progress = useLaunchState(instance?.id ?? null)
  const [hot, setHot] = useState(false)

  if (loading) {
    return (
      <div className={cn('flex items-center gap-3', className)} aria-busy>
        <Skeleton className="h-14 w-[268px] rounded-[14px]" />
        <Skeleton className="h-11 w-28 rounded-[12px]" />
      </div>
    )
  }

  if (!instance) {
    return (
      <div className={cn('flex flex-wrap items-center gap-3', className)}>
        <Button size="xl" variant="primary" className="accent-glow" leftIcon={<Download />} onClick={() => navigate('versions')}>
          Install your first version
        </Button>
        <Button variant="ghost" size="lg" leftIcon={<Terminal />} onClick={() => setConsoleOpen(true)}>
          Console
        </Button>
      </div>
    )
  }

  const blocker: Blocker | null = !msaConfigured
    ? {
        reason: 'Microsoft sign-in is not configured yet. Add a client id in Settings.',
        cta: (
          <Button size="lg" variant="secondary" leftIcon={<Settings />} onClick={() => navigate('settings')}>
            Set up sign-in
          </Button>
        )
      }
    : !account
      ? {
          reason: 'Sign in with the Microsoft account that owns Minecraft to play.',
          cta: (
            <Button size="lg" variant="secondary" leftIcon={<LogIn />} onClick={onSignIn}>
              Sign in to play
            </Button>
          )
        }
      : account.needsReauth
        ? {
            reason: 'Your session expired. Sign in again to play.',
            cta: (
              <Button size="lg" variant="secondary" leftIcon={<LogIn />} onClick={onSignIn}>
                Sign in again
              </Button>
            )
          }
        : null

  const preparing = progress?.phase === 'preparing' || actions.pending.launch
  const running = progress?.phase === 'running' || instance.running
  const disabled = blocker !== null || preparing
  const killMode = running && hot

  const label = preparing ? 'PREPARING…' : running ? (killMode ? 'KILL' : 'RUNNING') : 'LAUNCH'

  const onPrimary = (): void => {
    if (running) void actions.kill()
    else actions.launch()
  }

  const menu: DropdownItem[] = [
    { header: 'Instances' },
    ...(instances ?? []).map<DropdownItem>((i) => ({
      label: <InstanceMenuLabel instance={i} />,
      hint: <span className="font-mono">{i.minecraftVersion}</span>,
      checked: i.id === instance.id,
      onSelect: () => selectInstance(i.id)
    })),
    'separator',
    { label: 'Manage versions', icon: <Layers />, onSelect: () => navigate('versions') }
  ]

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div
        className={cn(
          'inline-flex items-stretch rounded-[14px] transition-shadow duration-300',
          !disabled && !running && 'accent-glow',
          running && !killMode && 'shadow-[0_0_0_1px_rgb(52_211_153/0.35),0_8px_30px_-6px_rgb(52_211_153/0.45)]'
        )}
      >
        <Tooltip content={blocker?.reason} side="top">
          {/* The span is the hover/focus target while the button is disabled, so the tooltip still shows. */}
          <span className={cn('inline-flex', blocker && 'cursor-not-allowed')} tabIndex={blocker ? 0 : -1}>
            <Button
              size="xl"
              variant={killMode ? 'danger' : 'primary'}
              className={cn(
                'min-w-[220px] rounded-r-none pr-6 font-bold tracking-[0.18em] disabled:pointer-events-none',
                running && !killMode && 'bg-success text-[#06070b] shadow-none hover:bg-success'
              )}
              disabled={disabled}
              loading={preparing}
              onClick={onPrimary}
              onMouseEnter={() => setHot(true)}
              onMouseLeave={() => setHot(false)}
              onFocus={() => setHot(true)}
              onBlur={() => setHot(false)}
              aria-label={running ? 'Kill the running game' : `Launch ${instance.name}`}
              leftIcon={running && killMode ? <Square className="fill-current" /> : undefined}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.14 }}
                  className="flex items-center gap-2"
                >
                  {running && !killMode && <span className="size-2 rounded-full bg-current animate-[pulse-soft_1.4s_ease-in-out_infinite]" aria-hidden />}
                  {label}
                </motion.span>
              </AnimatePresence>
            </Button>
          </span>
        </Tooltip>
        <Dropdown
          align="end"
          width={300}
          items={menu}
          trigger={
            <button
              type="button"
              aria-label="Choose an instance"
              disabled={preparing}
              className={cn(
                'press flex h-14 w-12 items-center justify-center rounded-r-[14px] border-l text-accent-fg transition-colors disabled:opacity-50',
                running ? 'border-black/20 bg-success text-[#06070b] hover:brightness-110' : 'border-black/15 bg-accent hover:bg-accent-hover'
              )}
            >
              <ChevronDown className="size-5" />
            </button>
          }
        />
      </div>
      {blocker?.cta}
      <Button variant="ghost" size="lg" leftIcon={<Terminal />} onClick={() => setConsoleOpen(true)}>
        Console
      </Button>
    </div>
  )
}
