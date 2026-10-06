import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Coffee, Plus, ShieldCheck, Trash } from 'lucide-react'
import { useState } from 'react'
import { type JavaRuntime } from '@shared/types'
import { errorMessage, errorTitle, invoke } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  JAVA_FILE_FILTERS,
  JAVA_SOURCE_LABELS,
  isRemovableRuntime,
  useAddCustomJava,
  useJavaRuntimes,
  useRemoveJavaRuntime,
  useValidateJava
} from './useJavaRuntimes'

export interface JavaRuntimesListProps {
  /** Show a "Validate" action that re-checks the executable. */
  allowValidate?: boolean
  /** Show the "Add custom JDK" button. */
  allowAdd?: boolean
  className?: string
}

function RuntimeRow({ runtime, allowValidate }: { runtime: JavaRuntime; allowValidate: boolean }) {
  const remove = useRemoveJavaRuntime()
  const validate = useValidateJava()
  const toast = useUi((s) => s.toast)
  const [checked, setChecked] = useState<'ok' | 'bad' | null>(null)

  const onValidate = (): void => {
    validate.mutate(runtime.path, {
      onSuccess: (result) => {
        setChecked(result.valid ? 'ok' : 'bad')
        if (result.valid) toast({ kind: 'success', title: `Java ${result.major ?? runtime.major} works`, message: result.version })
        else toast({ kind: 'error', title: 'That Java installation is not usable', message: result.error })
      },
      onError: () => setChecked('bad')
    })
  }

  const onRemove = async (): Promise<void> => {
    const ok = await confirm({
      title: `Remove Java ${runtime.major}?`,
      message:
        runtime.source === 'custom'
          ? 'The launcher forgets this JDK; nothing is deleted from disk. Instances using it fall back to a managed runtime.'
          : 'The downloaded runtime is deleted from disk. It is downloaded again the next time an instance needs it.',
      confirmLabel: 'Remove',
      danger: true
    })
    if (ok) remove.mutate(runtime.id)
  }

  const invalid = !runtime.valid || checked === 'bad'

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex items-center gap-3 rounded-[12px] border border-line bg-white/4 px-3.5 py-2.5"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
          invalid ? 'bg-danger/15 text-danger' : 'bg-white/6 text-fg-muted'
        )}
      >
        <Coffee className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fg">Java {runtime.major}</span>
          {runtime.version && <span className="font-mono text-xs text-fg-muted">{runtime.version}</span>}
          <Badge tone={runtime.source === 'custom' ? 'info' : 'neutral'} size="sm">
            {JAVA_SOURCE_LABELS[runtime.source]}
          </Badge>
          {invalid && (
            <Badge tone="danger" size="sm">
              Invalid
            </Badge>
          )}
          {checked === 'ok' && (
            <Badge tone="success" size="sm" icon={<CircleCheck />}>
              Verified
            </Badge>
          )}
        </div>
        <div className="selectable mt-0.5 truncate font-mono text-[11.5px] text-fg-subtle" title={runtime.path}>
          {runtime.path}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {allowValidate && (
          <Tooltip content="Run the executable and check its version">
            <IconButton label="Validate" size="sm" onClick={onValidate} disabled={validate.isPending}>
              <ShieldCheck className={cn(validate.isPending && 'animate-[pulse-soft_1s_ease-in-out_infinite]')} />
            </IconButton>
          </Tooltip>
        )}
        {isRemovableRuntime(runtime) && (
          <IconButton label="Remove" size="sm" variant="danger" onClick={() => void onRemove()} disabled={remove.isPending}>
            <Trash />
          </IconButton>
        )}
      </div>
    </motion.li>
  )
}

/** Lists managed, custom and detected Java runtimes with validate/remove/add actions. */
export function JavaRuntimesList({ allowValidate = false, allowAdd = false, className }: JavaRuntimesListProps) {
  const { data, isLoading, isError } = useJavaRuntimes()
  const addCustom = useAddCustomJava()
  const toast = useUi((s) => s.toast)

  const pickJdk = async (): Promise<void> => {
    try {
      const picked = await invoke('app:pickFile', { title: 'Choose a java executable', filters: JAVA_FILE_FILTERS })
      const path = picked?.[0]
      if (path) addCustom.mutate(path)
    } catch (err) {
      toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {isLoading ? (
        <ul className="space-y-2" aria-busy>
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-[12px] border border-line bg-white/4 px-3.5 py-2.5">
              <Skeleton className="size-9 rounded-[10px]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-72" />
              </div>
            </li>
          ))}
        </ul>
      ) : isError ? (
        <EmptyState compact title="Couldn't list Java runtimes" description="Try again in a moment." />
      ) : data && data.length > 0 ? (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {data.map((runtime) => (
              <RuntimeRow key={runtime.id} runtime={runtime} allowValidate={allowValidate} />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <EmptyState
          compact
          icon={<Coffee />}
          title="No Java runtimes yet"
          description="The right runtime is downloaded automatically the first time you launch."
        />
      )}
      {allowAdd && (
        <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => void pickJdk()} loading={addCustom.isPending}>
          Add custom JDK
        </Button>
      )}
    </div>
  )
}
