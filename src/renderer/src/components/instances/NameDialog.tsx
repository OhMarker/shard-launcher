import { useState, type ReactNode } from 'react'
import { type InstanceType } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export const INSTANCE_NAME_MAX = 64

export interface NameDialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  initialName: string
  confirmLabel: string
  /** Resolves when the action finished; the dialog closes on success. */
  onSubmit: (value: { name: string; type: InstanceType }) => Promise<void>
  /** Shows the Shard/Vanilla picker (used when creating a new instance). */
  withType?: boolean
  initialType?: InstanceType
  /** Names already taken for the same version, to warn before submitting. */
  takenNames?: readonly string[]
}

const TYPE_OPTIONS = [
  { value: 'shard', label: 'Shard (recommended)' },
  { value: 'vanilla', label: 'Vanilla (for testing)' }
] as const

function NameForm({
  initialName,
  initialType,
  withType,
  confirmLabel,
  takenNames,
  onClose,
  onSubmit
}: Omit<NameDialogProps, 'open' | 'title' | 'description'>) {
  const [name, setName] = useState(initialName)
  const [type, setType] = useState<InstanceType>(initialType ?? 'shard')
  const [busy, setBusy] = useState(false)

  const trimmed = name.trim()
  const tooLong = trimmed.length > INSTANCE_NAME_MAX
  const unchanged = trimmed === initialName.trim() && !withType
  const duplicate = !!takenNames?.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== initialName)
  const error = tooLong ? `Keep it under ${INSTANCE_NAME_MAX} characters` : null
  const canSubmit = trimmed.length > 0 && !tooLong && !unchanged && !busy

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit({ name: trimmed, type })
      onClose()
    } catch {
      // The caller's mutation already surfaced the error as a toast; keep the dialog open to retry.
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Name" hint={duplicate ? 'Another instance already uses this name.' : undefined}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My instance"
          maxLength={INSTANCE_NAME_MAX + 8}
          error={error}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
        />
      </Field>
      {withType && (
        <Field label="Type" hint="Vanilla instances skip Fabric, the bundled mods and the Shard client.">
          <Select<InstanceType> value={type} onChange={setType} options={TYPE_OPTIONS} />
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  )
}

/** Small prompt used for rename, duplicate and "add instance". State resets on every open. */
export function NameDialog({ open, onClose, title, description, ...rest }: NameDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      {open && <NameForm onClose={onClose} {...rest} />}
    </Dialog>
  )
}
