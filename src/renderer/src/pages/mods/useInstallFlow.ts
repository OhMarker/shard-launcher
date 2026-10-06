import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { type InstallPlan } from '@shared/types'
import { invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'
import { reportError } from './useModsData'

export interface InstallRequest {
  projectId: string
  versionId?: string
  /** Project title, for toasts and dialog headings. */
  title: string
}

export type InstallStep = 'conflicts' | 'options'

export interface PendingInstall {
  request: InstallRequest
  plan: InstallPlan
  step: InstallStep
}

export interface InstallFlow {
  /** Plans the install and either runs it or opens the conflict/options dialog. */
  start: (request: InstallRequest) => Promise<void>
  pending: PendingInstall | null
  cancel: () => void
  /** "Install anyway" on the conflicts step. */
  confirmConflicts: () => void
  /** Install with the chosen optional dependency project ids. */
  confirmOptions: (includeOptional: string[]) => void
  /** Project ids currently being planned or installed. */
  inFlight: ReadonlySet<string>
}

/**
 * Modrinth install pipeline: plan -> (conflicts dialog) -> (optional deps dialog) -> install.
 * The dialogs themselves are rendered by InstallPlanDialog from `pending`.
 */
export function useInstallFlow(instanceId: string | null): InstallFlow {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingInstall | null>(null)
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set())

  const mark = useCallback((projectId: string, on: boolean) => {
    setInFlight((s) => {
      const next = new Set(s)
      if (on) next.add(projectId)
      else next.delete(projectId)
      return next
    })
  }, [])

  const run = useCallback(
    async (request: InstallRequest, includeOptional: string[]) => {
      if (!instanceId) return
      mark(request.projectId, true)
      try {
        const result = await invoke('modrinth:install', {
          instanceId,
          projectId: request.projectId,
          versionId: request.versionId,
          includeOptional
        })
        const names = result.installed.map((m) => m.name)
        toast({
          kind: 'success',
          title: names.length
            ? `Installed ${names.join(', ')}`
            : `${request.title} is already installed`,
          message: result.skipped.length ? `Skipped: ${result.skipped.join(', ')}` : null
        })
        void qc.invalidateQueries({ queryKey: queryKeys.mods(instanceId) })
      } catch (err) {
        reportError(err)
      } finally {
        mark(request.projectId, false)
      }
    },
    [instanceId, mark, qc]
  )

  const start = useCallback(
    async (request: InstallRequest) => {
      if (!instanceId) return
      mark(request.projectId, true)
      try {
        const plan = await invoke('modrinth:plan', {
          instanceId,
          projectId: request.projectId,
          versionId: request.versionId
        })
        if (plan.items.length === 0 && plan.optional.length === 0) {
          const bundled = plan.alreadyInstalled.some(
            (a) => a.projectId === request.projectId && a.bundled
          )
          toast({
            kind: 'info',
            title: bundled
              ? `${request.title} is part of Shard Core`
              : `${request.title} is already installed`
          })
          return
        }
        if (plan.conflicts.length > 0) {
          setPending({ request, plan, step: 'conflicts' })
          return
        }
        if (plan.optional.length > 0) {
          setPending({ request, plan, step: 'options' })
          return
        }
        await run(request, [])
      } catch (err) {
        reportError(err)
      } finally {
        mark(request.projectId, false)
      }
    },
    [instanceId, mark, run]
  )

  const cancel = useCallback(() => setPending(null), [])

  const confirmConflicts = useCallback(() => {
    if (!pending) return
    if (pending.plan.optional.length > 0) {
      setPending({ ...pending, step: 'options' })
      return
    }
    setPending(null)
    void run(pending.request, [])
  }, [pending, run])

  const confirmOptions = useCallback(
    (includeOptional: string[]) => {
      if (!pending) return
      setPending(null)
      void run(pending.request, includeOptional)
    },
    [pending, run]
  )

  return { start, pending, cancel, confirmConflicts, confirmOptions, inFlight }
}
