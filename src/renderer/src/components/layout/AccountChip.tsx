import { ChevronsUpDown, LogIn, LogOut, Plus, RefreshCw, Settings, TriangleAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { type AccountSummary } from '@shared/types'
import { ShardError } from '@shared/errors'
import { useAccounts, useLogin, useLogout, useRefreshAccount, useSetActiveAccount } from '@/hooks/useAccounts'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { RemotePlayerHead } from '@/components/player/PlayerHead'
import { Dropdown, type DropdownItem } from '@/components/ui/Dropdown'
import { Skeleton } from '@/components/ui/Skeleton'
import { SignInDialog } from '@/components/auth/SignInDialog'

function AccountRow({ account }: { account: AccountSummary }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <RemotePlayerHead skinUrl={account.skinUrl} size={22} rounded="sm" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-tight">{account.username}</span>
        {account.needsReauth && <span className="block text-[11px] leading-tight text-warning">Sign in again</span>}
      </span>
    </span>
  )
}

export function AccountChip() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: info } = useSystemInfo()
  const setActive = useSetActiveAccount()
  const logout = useLogout()
  const refresh = useRefreshAccount()
  const login = useLogin()
  const toast = useUi((s) => s.toast)
  const navigate = useUi((s) => s.navigate)
  const [signInOpen, setSignInOpen] = useState(false)

  const active = accounts?.find((a) => a.isActive) ?? null
  const configured = info?.msaConfigured ?? true

  if (isLoading) {
    return (
      <div className="glass flex items-center gap-3 rounded-[14px] p-2.5">
        <Skeleton className="size-9 rounded-[10px]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
    )
  }

  if (!configured) {
    return (
      <button
        onClick={() => navigate('settings')}
        className="glass hover-lift flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left"
      >
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-warning/15 text-warning">
          <TriangleAlert className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">Sign-in not configured</span>
          <span className="block truncate text-[11px] text-fg-muted">Add a Microsoft client id</span>
        </span>
        <Settings className="size-4 text-fg-subtle" />
      </button>
    )
  }

  if (!active) {
    return (
      <>
        <button
          onClick={() => setSignInOpen(true)}
          className="glass hover-lift flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent/15 text-accent">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg">Sign in</span>
            <span className="block truncate text-[11px] text-fg-muted">Microsoft account</span>
          </span>
          <LogIn className="size-4 text-fg-subtle" />
        </button>
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </>
    )
  }

  const others = (accounts ?? []).filter((a) => a.id !== active.id)
  const items: DropdownItem[] = [
    { header: 'Accounts' },
    { label: <AccountRow account={active} />, onSelect: () => undefined, checked: true },
    ...others.map<DropdownItem>((a) => ({
      label: <AccountRow account={a} />,
      onSelect: () => {
        setActive.mutate(a.id, {
          onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
        })
      }
    })),
    'separator',
    { label: 'Add account', icon: <Plus />, onSelect: () => setSignInOpen(true) },
    {
      label: active.needsReauth ? 'Sign in again' : 'Refresh session',
      icon: <RefreshCw />,
      onSelect: () => {
        if (active.needsReauth) {
          login.mutate('browser', {
            onError: (err) => {
              const e = ShardError.from(err)
              if (e.code !== 'AUTH_CANCELLED') toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
            }
          })
          return
        }
        refresh.mutate(active.id, {
          onSuccess: () => toast({ kind: 'success', title: 'Session refreshed' }),
          onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
        })
      }
    },
    {
      label: `Log out ${active.username}`,
      icon: <LogOut />,
      danger: true,
      onSelect: () => logout.mutate(active.id)
    }
  ]

  return (
    <>
      <Dropdown
        align="start"
        side="top"
        width={260}
        items={items}
        trigger={
          <button
            className={cn(
              'glass hover-lift flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left',
              active.needsReauth && 'border-warning/40'
            )}
          >
            <RemotePlayerHead skinUrl={active.skinUrl} size={36} rounded="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-fg">{active.username}</span>
              <span className={cn('block truncate text-[11px]', active.needsReauth ? 'text-warning' : 'text-fg-muted')}>
                {active.needsReauth ? 'Session expired' : 'Microsoft account'}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-fg-subtle" />
          </button>
        }
      />
      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
