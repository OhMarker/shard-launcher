import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { TAGLINE } from '@shared/constants'
import { type AccountSummary } from '@shared/types'
import { useAccounts, useActiveAccount } from '@/hooks/useAccounts'
import { useInstances, useSelectedInstance } from '@/hooks/useInstances'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { useLaunchState } from '@/stores/launch'
import { PageBody } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { SignInDialog } from '@/components/auth/SignInDialog'
import { LaunchStepsPanel } from '@/components/instances/LaunchStepsPanel'
import { useInstanceActions } from '@/components/instances/useInstanceActions'
import { ChangelogColumn } from '@/pages/home/ChangelogColumn'
import { ConsolePanel } from '@/pages/home/ConsolePanel'
import { CrashCard, FailureCard } from '@/pages/home/CrashCard'
import { LaunchButton } from '@/pages/home/LaunchButton'
import { NewsRow } from '@/pages/home/NewsRow'
import { PlayerCard } from '@/pages/home/PlayerCard'
import { SelectedInstanceInfo } from '@/pages/home/SelectedInstanceInfo'

function Greeting({ account, loading }: { account: AccountSummary | null; loading: boolean }) {
  return (
    <div>
      {loading ? (
        <Skeleton className="h-9 w-80" />
      ) : (
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-fg">
          {account ? (
            <>
              Welcome back, <span className="text-gradient-accent">{account.username}</span>
            </>
          ) : (
            'Welcome to Shard'
          )}
        </h1>
      )}
      <p className="mt-1 text-[15px] text-fg-muted">{TAGLINE}</p>
    </div>
  )
}

const reveal = {
  initial: { opacity: 0, y: 10, height: 0 },
  animate: { opacity: 1, y: 0, height: 'auto' },
  exit: { opacity: 0, y: -6, height: 0 }
}

export function HomePage() {
  const { isLoading: instancesLoading } = useInstances()
  const { isLoading: accountsLoading } = useAccounts()
  const { data: info } = useSystemInfo()
  const selected = useSelectedInstance()
  const account = useActiveAccount()
  const progress = useLaunchState(selected?.id ?? null)
  const actions = useInstanceActions(selected)
  const [signInOpen, setSignInOpen] = useState(false)
  const closeSignIn = useCallback(() => setSignInOpen(false), [])
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const preparing = progress?.phase === 'preparing'
  const running = progress?.phase === 'running' || selected?.running === true
  const crashKey = progress?.phase === 'crashed' ? `${progress.instanceId}:crash:${progress.crashReportPath ?? progress.startedAt ?? ''}` : null
  const failKey = progress?.phase === 'failed' ? `${progress.instanceId}:failed:${progress.error?.message ?? progress.message ?? ''}` : null
  const showCrash = crashKey !== null && dismissedKey !== crashKey
  const showFailure = failKey !== null && dismissedKey !== failKey

  return (
    <div className="relative h-full">
      <PageBody wide>
        <section className="grid grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-8" aria-label="Launch">
          <div className="flex min-h-[460px] flex-col justify-between gap-8">
            <div className="space-y-6">
              <Greeting account={account} loading={accountsLoading} />
              <SelectedInstanceInfo instance={selected} loading={instancesLoading} running={running} />
            </div>
            <div className="space-y-4">
              <LaunchButton
                instance={selected}
                loading={instancesLoading}
                account={account}
                msaConfigured={info?.msaConfigured ?? true}
                actions={actions}
                onSignIn={() => setSignInOpen(true)}
              />
              <AnimatePresence initial={false}>
                {preparing && progress && (
                  <motion.div key="steps" {...reveal} className="overflow-hidden">
                    <LaunchStepsPanel progress={progress} onCancel={actions.cancelPrepare} cancelling={actions.pending.cancel} />
                  </motion.div>
                )}
                {showCrash && selected && progress && (
                  <motion.div key={crashKey} {...reveal} className="overflow-hidden">
                    <CrashCard instance={selected} progress={progress} onDismiss={() => setDismissedKey(crashKey)} />
                  </motion.div>
                )}
                {showFailure && progress && (
                  <motion.div key={failKey} {...reveal} className="overflow-hidden">
                    <FailureCard progress={progress} onRepair={actions.repair} repairing={actions.pending.repair} onDismiss={() => setDismissedKey(failKey)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <PlayerCard onSignIn={() => setSignInOpen(true)} />
        </section>

        <section className="mt-10 grid grid-cols-3 gap-6" aria-label="News and changelog">
          <NewsRow className="col-span-2 min-w-0" />
          <ChangelogColumn className="min-w-0" />
        </section>
      </PageBody>
      <ConsolePanel />
      <SignInDialog open={signInOpen} onClose={closeSignIn} />
    </div>
  )
}
