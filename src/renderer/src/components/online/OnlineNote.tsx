import { CircleAlert, CloudOff, LogIn, RefreshCw, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { type OnlineState } from '@shared/types'
import { cn } from '@/lib/cn'
import { SignInDialog } from '@/components/auth/SignInDialog'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

type NotReady = Exclude<OnlineState, { status: 'ready' }>

interface NoteCopy {
  icon: ReactNode
  title: string
  description: string
}

function copyFor(state: NotReady, signedOutHint: string): NoteCopy {
  switch (state.status) {
    case 'signed-out':
      return { icon: <UserRound />, title: 'Sign in to Shard', description: signedOutHint }
    case 'unavailable':
      return {
        icon: <CloudOff />,
        title: 'Shard online features are not available yet',
        description:
          state.message === 'Shard online features are not available yet'
            ? 'Tokens, the shop and friends will appear here as soon as the Shard server is online.'
            : `${state.message}. Everything else in the launcher keeps working.`
      }
    case 'error':
      return { icon: <CircleAlert />, title: 'Could not sign in to Shard', description: state.message }
  }
}

function NoteAction({ state, onRetry, retrying }: { state: NotReady; onRetry: () => void; retrying: boolean }) {
  const [signInOpen, setSignInOpen] = useState(false)
  if (state.status === 'signed-out') {
    return (
      <>
        <Button size="sm" variant="primary" leftIcon={<LogIn />} onClick={() => setSignInOpen(true)}>
          Sign in
        </Button>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </>
    )
  }
  return (
    <Button size="sm" variant="outline" leftIcon={<RefreshCw />} loading={retrying} onClick={onRetry}>
      Try again
    </Button>
  )
}

export interface OnlineNoteProps {
  state: NotReady
  onRetry: () => void
  retrying?: boolean
  /** What signing in unlocks on this page. */
  signedOutHint: string
  className?: string
}

/** One-line inline note for pages that work without the API (Cosmetics). */
export function OnlineNote({ state, onRetry, retrying = false, signedOutHint, className }: OnlineNoteProps) {
  const copy = copyFor(state, signedOutHint)
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 rounded-[12px] border border-line bg-white/4 px-3.5 py-2.5 text-[13px] text-fg-muted',
        state.status === 'error' && 'border-warning/30 bg-warning/8',
        className
      )}
    >
      <span className={cn('shrink-0 [&_svg]:size-4', state.status === 'error' ? 'text-warning' : 'text-info')}>
        {copy.icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-fg">{state.status === 'signed-out' ? signedOutHint : copy.title}</span>
        {state.status !== 'signed-out' && <span className="ml-1.5">{copy.description}</span>}
      </div>
      <NoteAction state={state} onRetry={onRetry} retrying={retrying} />
    </div>
  )
}

/** Full-page state for pages that need the API (Friends, Admin). */
export function OnlineEmptyState({ state, onRetry, retrying = false, signedOutHint }: OnlineNoteProps) {
  const copy = copyFor(state, signedOutHint)
  return (
    <div className="glass rounded-[var(--radius-lg)]">
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        description={copy.description}
        action={<NoteAction state={state} onRetry={onRetry} retrying={retrying} />}
      />
    </div>
  )
}
