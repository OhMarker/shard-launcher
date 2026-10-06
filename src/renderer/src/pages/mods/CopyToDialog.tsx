import { Check, ChevronRight, CircleX, Layers, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { pluralize } from '@shared/format'
import { type CopyModsResult, type InstanceSummary } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { type ModsMutations } from './useModsData'

export interface CopyToDialogProps {
  open: boolean
  onClose: () => void
  from: InstanceSummary
  instances: InstanceSummary[]
  modCount: number
  copyTo: ModsMutations['copyTo']
}

function CopyToBody({
  from,
  instances,
  copyTo,
  onClose
}: Pick<CopyToDialogProps, 'from' | 'instances' | 'copyTo' | 'onClose'>) {
  const [outcome, setOutcome] = useState<{
    target: InstanceSummary
    result: CopyModsResult
  } | null>(null)
  const targets = instances.filter((i) => i.id !== from.id)
  const pendingId = copyTo.isPending ? copyTo.variables : null

  if (outcome) {
    const { target, result } = outcome
    return (
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          {result.copied.length > 0
            ? `${pluralize(result.copied.length, 'mod')} copied to ${target.name}.`
            : `Nothing was copied to ${target.name}.`}
        </p>
        {result.copied.length > 0 && (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {result.copied.map((name) => (
              <li key={name} className="flex items-center gap-2.5 px-3 py-2 text-sm text-fg">
                <Check className="size-4 shrink-0 text-success" aria-hidden />
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        )}
        {result.failed.length > 0 && (
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-danger">Not copied</div>
            <ul className="divide-y divide-line rounded-[12px] border border-danger/30 bg-danger/5">
              {result.failed.map((f) => (
                <li key={f.name} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                  <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate text-fg">{f.name}</div>
                    <div className="text-xs text-fg-muted">{f.reason}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        </div>
      </div>
    )
  }

  if (targets.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Layers />}
        title="No other instances"
        description="Install another Minecraft version from the Versions page and come back to copy your mods there."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {targets.map((target) => {
        const differentVersion = target.minecraftVersion !== from.minecraftVersion
        const disabled = copyTo.isPending || target.running
        return (
          <li key={target.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                copyTo.mutate(target.id, { onSuccess: (result) => setOutcome({ target, result }) })
              }
              className="press flex w-full items-center gap-3 rounded-[12px] border border-line bg-white/4 px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{target.name}</span>
                  <Badge size="sm" tone="neutral">
                    {target.minecraftVersion}
                  </Badge>
                  <Badge size="sm" tone={target.type === 'shard' ? 'accent' : 'outline'}>
                    {target.type === 'shard' ? 'Shard' : 'Vanilla'}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                  {target.running ? (
                    'Running. Close the game to copy mods into it.'
                  ) : differentVersion ? (
                    <>
                      <TriangleAlert className="size-3.5 text-warning" aria-hidden />
                      Different Minecraft version. Mods without a matching build are skipped.
                    </>
                  ) : (
                    'Same Minecraft version.'
                  )}
                </div>
              </div>
              {pendingId === target.id ? (
                <LoaderCircle
                  className="size-4 animate-[spin_0.9s_linear_infinite] text-accent"
                  aria-hidden
                />
              ) : (
                <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CopyToDialog({
  open,
  onClose,
  from,
  instances,
  modCount,
  copyTo
}: CopyToDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Copy my mods to…"
      description={`Copies ${pluralize(modCount, 'mod')} from ${from.name}. Shard Core is managed per instance and is not copied.`}
      size="md"
    >
      {open && <CopyToBody from={from} instances={instances} copyTo={copyTo} onClose={onClose} />}
    </Dialog>
  )
}
