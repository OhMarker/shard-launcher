import { Check, Copy, ExternalLink, KeyRound, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { ERROR_TITLES, ShardError } from '@shared/errors'
import { URLS } from '@shared/constants'
import { type DeviceCodeInfo, type LoginProgress } from '@shared/types'
import { useLogin } from '@/hooks/useAccounts'
import { invoke, openExternal, useIpcEvent } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

const STAGES: Array<{ id: LoginProgress['stage']; label: string }> = [
  { id: 'microsoft', label: 'Microsoft account' },
  { id: 'xbox', label: 'Xbox Live' },
  { id: 'xsts', label: 'Xbox security token' },
  { id: 'minecraft', label: 'Minecraft services' },
  { id: 'entitlements', label: 'Checking ownership' },
  { id: 'profile', label: 'Loading profile' }
]

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

/** Dialog body. Mounted only while the dialog is open, so its state resets on every open. */
function SignInBody({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const login = useLogin()
  const toast = useUi((s) => s.toast)
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [progress, setProgress] = useState<LoginProgress | null>(null)
  const [error, setError] = useState<ShardError | null>(null)
  const [copied, setCopied] = useState(false)

  useIpcEvent('auth:deviceCode', (info) => setDevice(info))
  useIpcEvent('auth:loginProgress', (p) => setProgress(p))

  const start = (method: 'browser' | 'device'): void => {
    setError(null)
    setDevice(null)
    setProgress(null)
    onBusyChange(true)
    login.mutate(method, {
      onSuccess: (account) => {
        onBusyChange(false)
        toast({ kind: 'success', title: `Welcome, ${account.username}` })
        onClose()
      },
      onError: (err) => {
        onBusyChange(false)
        const e = ShardError.from(err)
        if (e.code === 'AUTH_CANCELLED') {
          onClose()
          return
        }
        setProgress(null)
        setDevice(null)
        setError(e)
      }
    })
  }

  const cancel = (): void => {
    void invoke('auth:cancelLogin')
    onBusyChange(false)
    onClose()
  }

  const copyCode = (): void => {
    if (!device) return
    void invoke('app:copyToClipboard', { text: device.userCode })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const busy = login.isPending
  const stageIndex = progress ? STAGES.findIndex((s) => s.id === progress.stage) : -1

  return (
    <>
      {error && (
        <div className="mb-4 rounded-[12px] border border-danger/30 bg-danger/10 p-3.5 text-sm">
          <div className="font-semibold text-danger">{ERROR_TITLES[error.code]}</div>
          <div className="mt-1 text-fg-muted">{error.message}</div>
          {error.code === 'AUTH_NO_GAME' && (
            <Button size="sm" variant="outline" className="mt-3" rightIcon={<ExternalLink />} onClick={() => openExternal(URLS.buyMinecraft)}>
              Get Minecraft: Java Edition
            </Button>
          )}
          {error.code === 'AUTH_NO_PROFILE' && (
            <Button size="sm" variant="outline" className="mt-3" rightIcon={<ExternalLink />} onClick={() => openExternal(URLS.minecraftProfileHelp)}>
              Create a profile on minecraft.net
            </Button>
          )}
          {error.code === 'AUTH_CHILD_ACCOUNT' && (
            <Button size="sm" variant="outline" className="mt-3" rightIcon={<ExternalLink />} onClick={() => openExternal(URLS.xboxFamily)}>
              Manage Microsoft family
            </Button>
          )}
        </div>
      )}

      {!busy && (
        <div className="space-y-2.5">
          <Button variant="primary" size="lg" fullWidth leftIcon={<MicrosoftLogo />} onClick={() => start('browser')} data-autofocus>
            Sign in with Microsoft
          </Button>
          <Button variant="ghost" size="md" fullWidth leftIcon={<KeyRound />} onClick={() => start('device')}>
            Use a code on another device instead
          </Button>
          <p className="pt-1 text-center text-xs text-fg-subtle">
            Shard never sees your password. Sign-in happens on Microsoft&apos;s site and only a session token is stored, encrypted,
            on this device.
          </p>
        </div>
      )}

      {busy && device && !progress && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Open <span className="font-medium text-fg">{device.verificationUri.replace(/^https?:\/\//, '')}</span> on any device and
            enter this code:
          </p>
          <button
            onClick={copyCode}
            className="group flex w-full items-center justify-center gap-3 rounded-[14px] border border-line-strong bg-white/5 py-4 font-mono text-2xl font-semibold tracking-[0.3em] text-fg transition-colors hover:bg-white/8"
          >
            {device.userCode}
            {copied ? <Check className="size-5 text-success" /> : <Copy className="size-5 text-fg-subtle group-hover:text-fg" />}
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth rightIcon={<ExternalLink />} onClick={() => openExternal(device.verificationUri)}>
              Open sign-in page
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
          <p className="flex items-center justify-center gap-2 text-xs text-fg-subtle">
            <LoaderCircle className="size-3.5 animate-[spin_0.9s_linear_infinite]" /> Waiting for you to finish signing in…
          </p>
        </div>
      )}

      {busy && !device && !progress && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <LoaderCircle className="size-6 animate-[spin_0.9s_linear_infinite] text-accent" />
          <div className="text-sm text-fg-muted">Finish signing in within the Microsoft window…</div>
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {busy && progress && (
        <div className="space-y-1.5 py-2">
          {STAGES.map((s, i) => {
            const done = i < stageIndex || progress.stage === 'done'
            const current = i === stageIndex
            return (
              <div key={s.id} className={cn('flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm', current && 'bg-white/5')}>
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border text-[10px]',
                    done && 'border-success/40 bg-success/15 text-success',
                    current && 'border-accent/50 text-accent',
                    !done && !current && 'border-line text-fg-subtle'
                  )}
                >
                  {done ? <Check className="size-3" /> : current ? <LoaderCircle className="size-3 animate-[spin_0.9s_linear_infinite]" /> : i + 1}
                </span>
                <span className={cn(done || current ? 'text-fg' : 'text-fg-subtle')}>{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const close = (): void => {
    if (busy) void invoke('auth:cancelLogin')
    setBusy(false)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Sign in to Shard"
      description="Use the Microsoft account that owns Minecraft: Java Edition."
      size="sm"
    >
      {open && <SignInBody onClose={onClose} onBusyChange={setBusy} />}
    </Dialog>
  )
}
