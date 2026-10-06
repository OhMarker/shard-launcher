import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, KeyRound, Plus, Trash, TriangleAlert, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { MSA } from '@shared/constants'
import { type AccountSummary } from '@shared/types'
import { useAccounts, useLogout, useSetActiveAccount } from '@/hooks/useAccounts'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle, invoke, openExternal, queryKeys } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { SignInDialog } from '@/components/auth/SignInDialog'
import { RemotePlayerHead } from '@/components/player/PlayerHead'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { InlineCode } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { README_MSA_URL } from './links'
import { SettingRow, SettingsSection } from './SettingsSection'
import { useSettingsUpdate } from './useSettingsUpdate'

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function maskId(id: string): string {
  return id.length > 4 ? `••••••••-••••-••••-••••-••••${id.slice(-4)}` : '••••'
}

function ClientIdForm({ initial, onSaved, onCancel }: { initial: string; onSaved: () => void; onCancel?: () => void }) {
  const update = useSettingsUpdate()
  const qc = useQueryClient()
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const trimmed = value.trim()
  const valid = GUID_RE.test(trimmed)

  const save = async (): Promise<void> => {
    if (!valid || saving) return
    setSaving(true)
    const ok = await update({ msaClientId: trimmed })
    setSaving(false)
    if (ok) {
      void qc.invalidateQueries({ queryKey: queryKeys.info })
      onSaved()
    }
  }

  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Input
        mono
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        aria-label="Azure application (client) id"
        spellCheck={false}
        autoComplete="off"
        error={trimmed !== '' && !valid ? 'An Azure application (client) id is a GUID' : null}
        className="flex-1"
      />
      <Button type="submit" variant="primary" disabled={!valid} loading={saving}>
        Save
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}
    </form>
  )
}

function SignInSetup() {
  const { data: info, isLoading } = useSystemInfo()
  const msaClientId = useSettings((s) => s.settings.msaClientId)
  const update = useSettingsUpdate()
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyRedirect = (): void => {
    void invoke('app:copyToClipboard', { text: MSA.redirectUri })
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch((err: unknown) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) }))
  }

  const clearStored = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Remove the stored client id?',
      message: 'Sign-in falls back to the MSA_CLIENT_ID environment variable, or stops working if none is set.',
      confirmLabel: 'Remove',
      danger: true
    })
    if (!ok) return
    if (await update({ msaClientId: null })) void qc.invalidateQueries({ queryKey: queryKeys.info })
  }

  if (isLoading || !info) {
    return (
      <div className="px-5 py-4" aria-busy>
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-2 h-3 w-80" />
      </div>
    )
  }

  if (!info.msaConfigured) {
    return (
      <div className="m-4 rounded-[14px] border border-warning/35 bg-warning/8 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-warning/15 text-warning" aria-hidden>
            <TriangleAlert className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold text-fg">Microsoft sign-in needs an Azure app registration</div>
              <p className="mt-1 text-[13px] leading-snug text-fg-muted">
                Players sign in with their own Microsoft account through an app you register for free in the Azure portal. Create a
                public client, add <InlineCode>{MSA.redirectUri}</InlineCode> as a “Mobile and desktop” redirect URI, enable “Allow
                public client flows”, then paste the Application (client) ID here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => openExternal(README_MSA_URL)}>
                Open the setup guide
              </Button>
              <Button size="sm" variant="ghost" leftIcon={copied ? <Check className="text-success" /> : <Copy />} onClick={copyRedirect}>
                {copied ? 'Copied' : 'Copy redirect URI'}
              </Button>
            </div>
            <ClientIdForm
              initial={msaClientId ?? ''}
              onSaved={() => toast({ kind: 'success', title: 'Sign-in configured', message: 'You can add a Microsoft account now.' })}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingRow
      label="Microsoft client id"
      description={
        msaClientId === null ? (
          'Configured via the MSA_CLIENT_ID environment variable.'
        ) : (
          <>
            Using the stored id <span className="font-mono text-fg">{maskId(msaClientId)}</span>
          </>
        )
      }
      stacked={editing}
    >
      {editing ? (
        <ClientIdForm initial={msaClientId ?? ''} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-2">
          <Badge tone="success" dot>
            Configured
          </Badge>
          <Button size="sm" variant="secondary" leftIcon={<KeyRound />} onClick={() => setEditing(true)}>
            {msaClientId === null ? 'Override' : 'Change'}
          </Button>
          {msaClientId !== null && (
            <Button size="sm" variant="ghost" onClick={() => void clearStored()}>
              Clear
            </Button>
          )}
        </div>
      )}
    </SettingRow>
  )
}

function AccountRow({ account }: { account: AccountSummary }) {
  const setActive = useSetActiveAccount()
  const logout = useLogout()
  const toast = useUi((s) => s.toast)
  const fail = (err: unknown): void => {
    toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  }

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${account.username}?`,
      message: 'The stored session is deleted from this device. You can sign in again at any time.',
      confirmLabel: 'Remove',
      danger: true
    })
    if (ok) logout.mutate(account.id, { onError: fail })
  }

  return (
    <li className={cn('flex items-center gap-3 px-5 py-3', account.isActive && 'bg-white/3')}>
      <RemotePlayerHead skinUrl={account.skinUrl} size={36} rounded="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{account.username}</span>
          {account.isActive && (
            <Badge tone="accent" size="sm" dot>
              Active
            </Badge>
          )}
          {account.needsReauth && (
            <Badge tone="warning" size="sm">
              Sign in again
            </Badge>
          )}
        </div>
        <div className="font-mono text-[11px] text-fg-subtle">{account.id}</div>
      </div>
      {!account.isActive && (
        <Button size="xs" variant="ghost" onClick={() => setActive.mutate(account.id, { onError: fail })} loading={setActive.isPending}>
          Make active
        </Button>
      )}
      <IconButton label={`Remove ${account.username}`} size="sm" variant="danger" onClick={() => void remove()} disabled={logout.isPending}>
        <Trash />
      </IconButton>
    </li>
  )
}

export function AccountsSection() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: info } = useSystemInfo()
  const [signInOpen, setSignInOpen] = useState(false)
  const closeSignIn = useCallback(() => setSignInOpen(false), [])
  const canSignIn = info?.msaConfigured ?? false

  return (
    <SettingsSection id="accounts" title="Accounts & sign-in" description="Microsoft accounts that own Minecraft: Java Edition." icon={<UserRound />}>
      <SignInSetup />
      <div>
        <div className="flex items-center justify-between gap-4 px-5 pt-4">
          <div className="text-sm font-medium text-fg">Accounts</div>
          <Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setSignInOpen(true)} disabled={!canSignIn}>
            Add account
          </Button>
        </div>
        {isLoading ? (
          <ul className="mt-2 divide-y divide-line" aria-busy>
            {[0, 1].map((i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="size-9 rounded-[8px]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </li>
            ))}
          </ul>
        ) : accounts && accounts.length > 0 ? (
          <ul className="mt-2 divide-y divide-line">
            {accounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<UserRound />} title="No accounts yet" description="Add the Microsoft account that owns Minecraft to start playing." />
        )}
      </div>
      <SignInDialog open={signInOpen} onClose={closeSignIn} />
    </SettingsSection>
  )
}
