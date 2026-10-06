import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type InstanceSummary } from '@shared/types'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { confirm } from '@/components/ui/confirm'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

/**
 * Every per-instance action the instance rows and the Home hero need, with error
 * toasts, confirmations and cache invalidation handled in one place.
 */
export function useInstanceActions(instance: InstanceSummary | null) {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const navigate = useUi((s) => s.navigate)
  const selectInstance = useUi((s) => s.selectInstance)
  const selectedInstanceId = useUi((s) => s.selectedInstanceId)
  const defaultInstanceId = useSettings((s) => s.settings.defaultInstanceId)
  const updateSettings = useSettings((s) => s.update)

  const id = instance?.id ?? null
  const isDefault = id !== null && defaultInstanceId === id

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: queryKeys.instances })
    void qc.invalidateQueries({ queryKey: ['versions'] })
  }
  const fail = (err: unknown): void => {
    toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  }

  const rename = useMutation({
    mutationFn: (name: string) => invoke('instances:update', { id: id!, patch: { name } }),
    onSuccess: invalidate,
    onError: fail
  })

  const duplicate = useMutation({
    mutationFn: (name: string) => invoke('instances:duplicate', { id: id!, name }),
    onSuccess: (created) => {
      invalidate()
      toast({ kind: 'success', title: `Duplicated as ${created.name}` })
    },
    onError: fail
  })

  const repair = useMutation({
    mutationFn: () => invoke('instances:prepare', { id: id!, repair: true }),
    onSuccess: () => toast({ kind: 'info', title: 'Repair started', message: 'Every file is re-verified by hash.' }),
    onError: fail
  })

  const reinstallClient = useMutation({
    mutationFn: () => invoke('shard:reinstall', { instanceId: id! }),
    onSuccess: () => {
      invalidate()
      toast({ kind: 'success', title: 'Shard client reinstalled' })
    },
    onError: fail
  })

  const remove = useMutation({
    mutationFn: () => invoke('instances:delete', { id: id! }),
    onSuccess: () => {
      if (selectedInstanceId === id) selectInstance(null)
      invalidate()
      toast({ kind: 'success', title: `Deleted ${instance?.name ?? 'instance'}` })
    },
    onError: fail
  })

  const launch = useMutation({
    mutationFn: () => invoke('launch:start', { instanceId: id! }),
    onError: fail
  })

  const kill = useMutation({
    mutationFn: () => invoke('launch:kill', { instanceId: id! }),
    onError: fail
  })

  const cancelPrepare = useMutation({
    mutationFn: () => invoke('instances:cancelPrepare', { id: id! }),
    onError: fail
  })

  return {
    isDefault,
    rename: async (name: string): Promise<void> => {
      await rename.mutateAsync(name)
    },
    duplicate: async (name: string): Promise<void> => {
      await duplicate.mutateAsync(name)
    },
    openFolder: (): void => {
      if (id) void invoke('instances:openFolder', { id }).catch(fail)
    },
    repair: (): void => repair.mutate(),
    reinstallClient: (): void => reinstallClient.mutate(),
    setDefault: (): void => {
      void updateSettings({ defaultInstanceId: isDefault ? null : id }).catch(fail)
    },
    remove: async (): Promise<void> => {
      if (!instance) return
      const ok = await confirm({
        title: `Delete ${instance.name}?`,
        message:
          'The instance folder, its worlds, mods, screenshots and settings are removed permanently. Shared libraries and assets stay for other instances.',
        confirmLabel: 'Delete',
        danger: true
      })
      if (ok) await remove.mutateAsync().catch(() => undefined)
    },
    /** Starts the game and, optionally, jumps to Home where the progress lives. */
    launch: (options: { goHome?: boolean } = {}): void => {
      if (!id) return
      selectInstance(id)
      if (options.goHome) navigate('home')
      launch.mutate()
    },
    kill: async (): Promise<void> => {
      if (!instance) return
      const ok = await confirm({
        title: `Kill ${instance.name}?`,
        message: 'The game is force-closed. Anything not saved in the last autosave is lost.',
        confirmLabel: 'Kill game',
        danger: true
      })
      if (ok) kill.mutate()
    },
    cancelPrepare: (): void => cancelPrepare.mutate(),
    pending: {
      launch: launch.isPending,
      kill: kill.isPending,
      repair: repair.isPending,
      reinstall: reinstallClient.isPending,
      remove: remove.isPending,
      cancel: cancelPrepare.isPending
    }
  }
}

export type InstanceActions = ReturnType<typeof useInstanceActions>
