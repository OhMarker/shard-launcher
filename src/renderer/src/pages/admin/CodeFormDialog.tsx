import { Check, Coins, Search, Ticket } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import {
  EMPTY_CODE_DRAFT,
  draftFromCode,
  validateCodeDraft,
  type CodeDraft,
  type CodeDraftErrors
} from '@shared/online'
import { type Cosmetic, type CosmeticsView, type PromoCode } from '@shared/types'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { CosmeticTile } from '@/components/cosmetics/CosmeticTile'
import { RarityBadge } from '@/components/cosmetics/RarityBadge'
import { RARITY_RANK, TYPE_LABELS } from '../cosmetics/cosmetics-utils'
import { type AdminMutations } from './useAdmin'

export interface CodeFormDialogProps {
  open: boolean
  /** The code being edited, or null for a new one. */
  editing: PromoCode | null
  catalogue: CosmeticsView | undefined
  m: AdminMutations
  onClose: () => void
}

function ItemPicker({
  items,
  selected,
  previews,
  onToggle
}: {
  items: readonly Cosmetic[]
  selected: readonly string[]
  previews: Record<string, string>
  onToggle: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = items.filter((c) => needle === '' || c.name.toLowerCase().includes(needle) || c.id.includes(needle))
  return (
    <div className="space-y-2">
      <Input size="sm" leftIcon={<Search />} placeholder="Find a cosmetic" aria-label="Find a cosmetic" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="grid max-h-[232px] grid-cols-3 gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]" role="group" aria-label="Items the code gives">
        {shown.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.id)}
              className={cn(
                'press relative flex items-center gap-2 rounded-[10px] border p-1.5 pr-2 text-left transition-colors',
                on ? 'border-accent/60 bg-accent/10 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.3)]' : 'border-line bg-white/4 hover:border-line-strong'
              )}
            >
              <CosmeticTile cosmetic={c} previewUrl={previews[c.id] ?? null} className="size-10 shrink-0 rounded-[7px]" iconClassName="size-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-fg">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1">
                  <RarityBadge rarity={c.rarity} className="h-4 px-1.5 text-[10px]" />
                  <span className="truncate text-[10.5px] text-fg-subtle">{TYPE_LABELS[c.type]}</span>
                </span>
              </span>
              {on && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          )
        })}
        {shown.length === 0 && <p className="col-span-3 py-4 text-center text-xs text-fg-subtle">No cosmetic matches.</p>}
      </div>
    </div>
  )
}

/**
 * Create or edit a promo code: what it gives, how often it works, until when. Give it a new `key`
 * whenever it opens so the form is filled from `editing` again.
 */
export function CodeFormDialog({ open, editing, catalogue, m, onClose }: CodeFormDialogProps) {
  // The parent remounts this dialog (a new key) each time it opens, so the form starts fresh.
  const [draft, setDraft] = useState<CodeDraft>(() => (editing ? draftFromCode(editing) : EMPTY_CODE_DRAFT))
  const [errors, setErrors] = useState<CodeDraftErrors>({})

  // Bundles are sold, not granted: a code gives the items themselves.
  const items = useMemo(
    () =>
      (catalogue?.manifest.cosmetics ?? [])
        .filter((c) => c.type !== 'bundle')
        .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.name.localeCompare(b.name)),
    [catalogue]
  )
  const set = <K extends keyof CodeDraft>(key: K, value: CodeDraft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const toggleItem = (id: string): void =>
    set('items', draft.items.includes(id) ? draft.items.filter((i) => i !== id) : [...draft.items, id])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const result = validateCodeDraft(draft, { now: Date.now(), editing: editing !== null })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    m.codeSave.mutate(result.input, { onSuccess: onClose })
  }

  const unknownItems = draft.items.filter((id) => !items.some((c) => c.id === id))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${editing.code}` : 'New promo code'}
      description={
        editing
          ? 'Changes apply to the next redemption. Uses so far are kept.'
          : 'Players type the code on the Codes page. Each player can use it once per round.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" leftIcon={<Ticket />} loading={m.codeSave.isPending} type="submit" form="code-form">
            {editing ? 'Save code' : 'Create code'}
          </Button>
        </>
      }
    >
      <form id="code-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" hint={editing ? 'The code itself cannot change; make a new one instead.' : '3 to 32 letters, numbers, - or _'}>
            <Input
              mono
              value={draft.code}
              disabled={editing !== null}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="HALLOWEEN"
              aria-label="Code"
              maxLength={32}
              error={errors.code}
              data-autofocus
            />
          </Field>
          <Field label="Tokens" hint="0 for items only">
            <Input
              type="number"
              min={0}
              max={1_000_000}
              leftIcon={<Coins />}
              value={draft.tokens}
              onChange={(e) => set('tokens', e.target.value)}
              aria-label="Tokens"
              error={errors.tokens}
            />
          </Field>
        </div>

        <Field
          label={
            <span>
              Items <span className="font-normal text-fg-subtle">· {draft.items.length} picked</span>
            </span>
          }
          hint={errors.items ? undefined : 'Players who already own an item just get the rest.'}
        >
          <ItemPicker items={items} selected={draft.items} previews={catalogue?.previews ?? {}} onToggle={toggleItem} />
          {unknownItems.length > 0 && (
            <p className="text-xs text-warning">Not in the catalogue: {unknownItems.join(', ')} (kept).</p>
          )}
          {errors.items && <p className="text-xs text-danger">{errors.items}</p>}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Max uses per round" hint="Empty for unlimited">
            <Input
              type="number"
              min={1}
              value={draft.maxUses}
              onChange={(e) => set('maxUses', e.target.value)}
              placeholder="Unlimited"
              aria-label="Max uses per round"
              error={errors.maxUses}
            />
          </Field>
          <Field label="Expires" hint={draft.expiresAt ? 'Your local time' : 'Never expires'}>
            <div className="flex items-start gap-2">
              <Input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(e) => set('expiresAt', e.target.value)}
                aria-label="Expiry date and time"
                error={errors.expiresAt}
                className="flex-1 [color-scheme:dark]"
              />
              {draft.expiresAt && (
                <Button type="button" size="md" variant="ghost" onClick={() => set('expiresAt', '')}>
                  Never
                </Button>
              )}
            </div>
          </Field>
        </div>

        <Field label="Note" hint="Only staff see this">
          <Textarea
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
            maxLength={200}
            placeholder="Halloween 2026 stream giveaway"
            aria-label="Note"
            className="[&_textarea]:min-h-14"
            error={errors.note}
          />
        </Field>

        <Switch
          checked={draft.active}
          onCheckedChange={(active) => set('active', active)}
          label="Active"
          description="Turn off to pause the code without deleting it."
        />

        {m.codeSave.isError && (
          <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {errorMessage(m.codeSave.error)}
          </p>
        )}
      </form>
    </Dialog>
  )
}
