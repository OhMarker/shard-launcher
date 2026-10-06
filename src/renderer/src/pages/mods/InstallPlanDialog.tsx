import { Check, Lock, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { pluralize } from '@shared/format'
import { type InstallPlan, type InstallPlanItem } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineCode } from '@/components/ui/Misc'
import { ModIcon } from '@/components/mods/ModIcon'
import { type PendingInstall } from './useInstallFlow'

export interface InstallPlanDialogProps {
  pending: PendingInstall | null
  onCancel: () => void
  onConfirmConflicts: () => void
  onConfirmOptions: (includeOptional: string[]) => void
}

const EMPTY: ReadonlySet<string> = new Set()

function PlanItemRow({ item, trailing }: { item: InstallPlanItem; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <ModIcon src={item.iconUrl} name={item.title} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg">{item.title}</div>
        <div className="truncate font-mono text-xs text-fg-subtle">
          {item.version.versionNumber}
        </div>
      </div>
      {trailing}
    </div>
  )
}

function ConflictsBody({ plan }: { plan: InstallPlan }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-[12px] border border-danger/30 bg-danger/10 p-4">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-danger">Known conflicts with Shard</div>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-muted">
            {plan.conflicts.map((c) => (
              <li key={c.slug}>
                <InlineCode>{c.slug}</InlineCode> <span className="text-fg-subtle">—</span>{' '}
                {c.reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm text-fg-muted">
        Installing anyway can break Shard Core mods or crash the game. You can remove it later from
        Your Mods.
      </p>
    </div>
  )
}

function OptionsBody({
  plan,
  selected,
  onToggle
}: {
  plan: InstallPlan
  selected: ReadonlySet<string>
  onToggle: (projectId: string) => void
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
          Will be installed
        </h3>
        <div className="mt-2 divide-y divide-line rounded-[12px] border border-line">
          {plan.items.map((item) => (
            <PlanItemRow
              key={item.projectId}
              item={item}
              trailing={
                <Badge size="sm" tone={item.reason === 'requested' ? 'accent' : 'neutral'}>
                  {item.reason === 'requested' ? 'Requested' : 'Required'}
                </Badge>
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
          Optional dependencies
        </h3>
        <p className="mt-1 text-xs text-fg-muted">
          Pick the extras you want. Anything you skip can be installed later from Modrinth.
        </p>
        <div className="mt-2 divide-y divide-line rounded-[12px] border border-line">
          {plan.optional.map((item) => {
            const checked = selected.has(item.projectId)
            return (
              <label
                key={item.projectId}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/4"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.projectId)}
                  className="size-4 shrink-0 cursor-pointer accent-accent"
                />
                <ModIcon src={item.iconUrl} name={item.title} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">{item.title}</div>
                  <div className="truncate font-mono text-xs text-fg-subtle">
                    {item.version.versionNumber}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {plan.alreadyInstalled.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Already installed
          </h3>
          <ul className="mt-2 space-y-1.5">
            {plan.alreadyInstalled.map((a) => (
              <li key={a.projectId} className="flex items-center gap-2 text-sm text-fg-muted">
                <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                <span className="truncate">{a.title}</span>
                {a.bundled && (
                  <Badge size="sm" tone="accent" icon={<Lock />}>
                    Shard Core
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Conflict warning and optional-dependency picker for a Modrinth install plan. */
export function InstallPlanDialog({
  pending,
  onCancel,
  onConfirmConflicts,
  onConfirmOptions
}: InstallPlanDialogProps) {
  // Selection is keyed by project so a new plan never inherits the previous one's checkboxes.
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null)
  const key = pending?.request.projectId ?? ''
  const selected = selection && selection.key === key ? selection.ids : EMPTY
  const toggle = (projectId: string): void => {
    const next = new Set(selected)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    setSelection({ key, ids: next })
  }

  const conflicts = pending?.step === 'conflicts'
  const installCount = pending ? pending.plan.items.length + selected.size : 0

  return (
    <Dialog
      open={pending !== null}
      onClose={onCancel}
      title={
        pending
          ? conflicts
            ? `${pending.request.title} conflicts with Shard`
            : `Install ${pending.request.title}`
          : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {conflicts ? (
            <Button variant="danger" onClick={onConfirmConflicts} data-autofocus>
              Install anyway
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onConfirmOptions([...selected])}
              data-autofocus
            >
              Install {pluralize(installCount, 'mod')}
            </Button>
          )}
        </>
      }
    >
      {pending &&
        (conflicts ? (
          <ConflictsBody plan={pending.plan} />
        ) : (
          <OptionsBody plan={pending.plan} selected={selected} onToggle={toggle} />
        ))}
    </Dialog>
  )
}
