import { Coins, Copy, Pencil, Plus, RotateCcw, Search, Ticket, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ShardError } from '@shared/errors'
import { codeStatus, type CodeStatus } from '@shared/online'
import { type CosmeticsView, type PromoCode } from '@shared/types'
import { useNow } from '@/hooks/useNow'
import { invoke } from '@/lib/api'
import { cn } from '@/lib/cn'
import { toast } from '@/stores/ui'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Tooltip } from '@/components/ui/Tooltip'
import { confirm } from '@/components/ui/confirm'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { CodeFormDialog } from './CodeFormDialog'
import { type AdminMutations } from './useAdmin'

const COLUMNS = 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_140px_156px_48px_104px] items-center gap-3'

const STATUS: Record<CodeStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Live', tone: 'success' },
  off: { label: 'Off', tone: 'outline' },
  expired: { label: 'Expired', tone: 'warning' },
  'used-up': { label: 'Used up', tone: 'danger' }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function expiryText(expiresAt: number | null, now: number): { main: string; sub: string | null } {
  if (expiresAt === null) return { main: 'Never', sub: null }
  const days = Math.round((expiresAt - now) / 86_400_000)
  const sub =
    expiresAt <= now ? 'ended' : days >= 1 ? `in ${days} day${days === 1 ? '' : 's'}` : `in ${Math.max(1, Math.round((expiresAt - now) / 3_600_000))} h`
  return { main: dateFormat.format(new Date(expiresAt)), sub }
}

function CodeRow({
  code,
  catalogue,
  m,
  now,
  onEdit
}: {
  code: PromoCode
  catalogue: CosmeticsView | undefined
  m: AdminMutations
  now: number
  onEdit: () => void
}) {
  const status = codeStatus(code, now)
  const byId = new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c]))
  const expiry = expiryText(code.expiresAt, now)
  const toggling = m.codeSave.isPending && m.codeSave.variables?.code === code.code

  const toggle = (active: boolean): void =>
    m.codeSave.mutate(
      {
        code: code.code,
        tokens: code.tokens,
        items: code.items,
        maxUses: code.maxUses,
        expiresAt: code.expiresAt,
        note: code.note,
        active
      },
      {
        onSuccess: () => toast({ kind: 'success', title: active ? `${code.code} is on` : `${code.code} is off` }),
        onError: (err) => toast({ kind: 'error', title: 'Could not change the code', message: ShardError.from(err).message })
      }
    )

  const reset = async (): Promise<void> => {
    const ok = await confirm({
      title: `Reset ${code.code}?`,
      message: `Everyone can use it once more. Round ${code.round + 1} starts with 0 uses${code.maxUses !== null ? ` of ${code.maxUses}` : ''}.`,
      confirmLabel: 'Reset code'
    })
    if (ok) m.codeReset.mutate(code.code)
  }

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: `Delete ${code.code}?`,
      message: 'Nobody can redeem it any more. Players keep what it already gave them. This cannot be undone.',
      confirmLabel: 'Delete code',
      danger: true
    })
    if (ok) m.codeDelete.mutate(code.code)
  }

  const copy = (): void => {
    void invoke('app:copyToClipboard', { text: code.code }).then(() => toast({ kind: 'success', title: `Copied ${code.code}` }))
  }

  return (
    <li className={cn(COLUMNS, 'px-4 py-3', status !== 'active' && 'bg-white/[0.015]')}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copy}
            title="Copy the code"
            className="group flex min-w-0 items-center gap-1.5 font-mono text-[13.5px] font-semibold tracking-wide text-fg"
          >
            <span className="truncate">{code.code}</span>
            <Copy className="size-3 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <Badge size="sm" tone={STATUS[status].tone} dot={status === 'active'}>
            {STATUS[status].label}
          </Badge>
        </div>
        {code.note ? (
          <div className="mt-0.5 truncate text-xs text-fg-muted" title={code.note}>
            {code.note}
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-fg-subtle">No note</div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {code.tokens > 0 && (
          <Badge size="sm" tone="warning" icon={<Coins />}>
            {code.tokens}
          </Badge>
        )}
        {code.items.map((id) => {
          const c = byId.get(id)
          return (
            <Tooltip key={id} content={c?.name ?? id}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/4 py-0.5 pl-0.5 pr-2">
                {c ? (
                  <CosmeticTile cosmetic={c} previewUrl={catalogue?.previews[id] ?? null} className="size-5 rounded-full" iconClassName="size-3" />
                ) : (
                  <span className="size-5 rounded-full bg-white/8" />
                )}
                <span className="max-w-[110px] truncate text-[11px] text-fg">{c?.name ?? id}</span>
              </span>
            </Tooltip>
          )
        })}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold tabular-nums text-fg">
            {code.usesThisRound}
            <span className="font-normal text-fg-subtle"> / {code.maxUses ?? '∞'}</span>
          </span>
          <span className="text-[10.5px] text-fg-subtle">round {code.round}</span>
        </div>
        {code.maxUses !== null ? (
          <Progress
            value={Math.min(100, (code.usesThisRound / code.maxUses) * 100)}
            tone={status === 'used-up' ? 'danger' : 'accent'}
            className="mt-1"
          />
        ) : (
          <div className="mt-1 h-1.5 rounded-full bg-white/6" />
        )}
        <div className="mt-0.5 text-[10.5px] text-fg-subtle">{code.usesTotal} total</div>
      </div>

      <div className="min-w-0 text-xs">
        <div className={cn('truncate', status === 'expired' ? 'text-warning' : 'text-fg')}>{expiry.main}</div>
        {expiry.sub && <div className="text-[10.5px] text-fg-subtle">{expiry.sub}</div>}
      </div>

      <Switch size="sm" checked={code.active} disabled={toggling} onCheckedChange={toggle} />

      <div className="flex justify-end gap-1">
        <IconButton label={`Edit ${code.code}`} size="sm" variant="ghost" onClick={onEdit}>
          <Pencil />
        </IconButton>
        <IconButton
          label={`Reset ${code.code}: everyone can use it once more`}
          size="sm"
          variant="ghost"
          disabled={m.codeReset.isPending && m.codeReset.variables === code.code}
          onClick={() => void reset()}
        >
          <RotateCcw />
        </IconButton>
        <IconButton label={`Delete ${code.code}`} size="sm" variant="danger" onClick={() => void remove()}>
          <Trash2 />
        </IconButton>
      </div>
    </li>
  )
}

export interface CodesSectionProps {
  codes: readonly PromoCode[] | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  retrying: boolean
  catalogue: CosmeticsView | undefined
  m: AdminMutations
}

/** Promo codes: list, create, edit, pause, reset (a new round) and delete. */
export function CodesSection({ codes, loading, error, onRetry, retrying, catalogue, m }: CodesSectionProps) {
  const [form, setForm] = useState<{ open: boolean; editing: PromoCode | null; key: number }>({
    open: false,
    editing: null,
    key: 0
  })
  const [query, setQuery] = useState('')
  const now = useNow()
  const openForm = (editing: PromoCode | null): void => {
    m.codeSave.reset()
    setForm((f) => ({ open: true, editing, key: f.key + 1 }))
  }
  const needle = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      (codes ?? []).filter(
        (c) => needle === '' || c.code.toLowerCase().includes(needle) || c.note.toLowerCase().includes(needle)
      ),
    [codes, needle]
  )
  const live = (codes ?? []).filter((c) => codeStatus(c, now) === 'active').length

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight text-fg">Promo codes</h2>
            <p className="text-xs text-fg-muted">
              {codes ? `${codes.length} code${codes.length === 1 ? '' : 's'} · ${live} live. ` : ''}
              Each player can redeem a code once per round; Reset starts a new round.
            </p>
          </div>
          <Input
            size="sm"
            leftIcon={<Search />}
            placeholder="Find a code"
            aria-label="Find a code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-44"
          />
          <Button size="sm" variant="primary" leftIcon={<Plus />} onClick={() => openForm(null)}>
            New code
          </Button>
        </div>
        <div className={`${COLUMNS} border-b border-line bg-white/2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle`}>
          <span>Code</span>
          <span>Gives</span>
          <span>Uses this round</span>
          <span>Expires</span>
          <span>On</span>
          <span />
        </div>
        {loading ? (
          <div className="space-y-3 px-4 py-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorCard className="m-4" error={error} onRetry={onRetry} retrying={retrying} />
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon={<Ticket />}
            title={codes && codes.length > 0 ? 'No code matches' : 'No codes yet'}
            description={codes && codes.length > 0 ? `Nothing matches "${query.trim()}".` : 'Create a code to give players Shards or cosmetics.'}
            action={
              !codes?.length && (
                <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => openForm(null)}>
                  New code
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <CodeRow key={c.code} code={c} catalogue={catalogue} m={m} now={now} onEdit={() => openForm(c)} />
            ))}
          </ul>
        )}
      </Card>

      <CodeFormDialog
        key={form.key}
        open={form.open}
        editing={form.editing}
        catalogue={catalogue}
        m={m}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
    </>
  )
}
