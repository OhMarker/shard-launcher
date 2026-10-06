import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShardError } from '@shared/errors'
import { pluralize } from '@shared/format'
import { type InstanceModsView } from '@shared/types'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'
import { splitImportPaths } from './mods-utils'

export function reportError(err: unknown): void {
  toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
}

export function useModsView(instanceId: string | null) {
  return useQuery({
    queryKey: queryKeys.mods(instanceId ?? ''),
    queryFn: () => invoke('mods:view', { instanceId: instanceId ?? '' }),
    enabled: instanceId !== null
  })
}

function requireInstance(id: string | null): string {
  if (!id) throw new ShardError('INVALID_INPUT', 'Select an instance first.')
  return id
}

/** Every mutation the Mods page performs, with optimistic toggles and error toasts built in. */
export function useModsMutations(instanceId: string | null) {
  const qc = useQueryClient()
  const key = queryKeys.mods(instanceId ?? '')
  const invalidate = (): Promise<void> => qc.invalidateQueries({ queryKey: key })

  const patchView = async (
    updater: (view: InstanceModsView) => InstanceModsView
  ): Promise<InstanceModsView | undefined> => {
    await qc.cancelQueries({ queryKey: key })
    const prev = qc.getQueryData<InstanceModsView>(key)
    if (prev) qc.setQueryData<InstanceModsView>(key, updater(prev))
    return prev
  }
  const rollback = (err: unknown, prev: InstanceModsView | undefined): void => {
    if (prev) qc.setQueryData(key, prev)
    reportError(err)
  }

  const setEnabled = useMutation({
    mutationFn: (vars: { fileName: string; enabled: boolean }) =>
      invoke('mods:setEnabled', { instanceId: requireInstance(instanceId), ...vars }),
    onMutate: (vars) =>
      patchView((v) => ({
        ...v,
        yours: v.yours.map((m) =>
          m.fileName === vars.fileName ? { ...m, enabled: vars.enabled } : m
        )
      })),
    onError: (err, _vars, prev) => rollback(err, prev),
    onSettled: invalidate
  })

  const setBundledEnabled = useMutation({
    mutationFn: (vars: { slug: string; enabled: boolean }) =>
      invoke('mods:setBundledEnabled', { instanceId: requireInstance(instanceId), ...vars }),
    onMutate: (vars) =>
      patchView((v) => ({
        ...v,
        core: v.core.map((c) =>
          c.def.slug === vars.slug && (c.state === 'installed' || c.state === 'disabled')
            ? { ...c, state: vars.enabled ? 'installed' : 'disabled' }
            : c
        )
      })),
    onError: (err, _vars, prev) => rollback(err, prev),
    onSettled: invalidate
  })

  const remove = useMutation({
    mutationFn: (fileName: string) =>
      invoke('mods:remove', { instanceId: requireInstance(instanceId), fileName }),
    onMutate: (fileName) =>
      patchView((v) => ({ ...v, yours: v.yours.filter((m) => m.fileName !== fileName) })),
    onError: (err, _vars, prev) => rollback(err, prev),
    onSettled: invalidate
  })

  const update = useMutation({
    mutationFn: (fileName: string) =>
      invoke('mods:update', { instanceId: requireInstance(instanceId), fileName }),
    onSuccess: (mod) =>
      toast({
        kind: 'success',
        title: `Updated ${mod.name}`,
        message: mod.version ? `Now on ${mod.version}` : null
      }),
    onError: reportError,
    onSettled: invalidate
  })

  const updateAll = useMutation({
    mutationFn: () => invoke('mods:updateAll', { instanceId: requireInstance(instanceId) }),
    onSuccess: ({ updated }) =>
      toast({
        kind: 'success',
        title: updated.length
          ? `Updated ${pluralize(updated.length, 'mod')}`
          : 'Everything is up to date',
        message: updated.length ? updated.join(', ') : null
      }),
    onError: reportError,
    onSettled: invalidate
  })

  const checkUpdates = useMutation({
    mutationFn: () => invoke('mods:checkUpdates', { instanceId: requireInstance(instanceId) }),
    onSuccess: (mods) => {
      const count = mods.filter((m) => m.update !== null).length
      toast({
        kind: count ? 'info' : 'success',
        title: count ? `${pluralize(count, 'update')} available` : 'All mods are up to date'
      })
    },
    onError: reportError,
    onSettled: invalidate
  })

  const syncBundled = useMutation({
    mutationFn: () => invoke('mods:syncBundled', { instanceId: requireInstance(instanceId) }),
    onSuccess: (view) => {
      qc.setQueryData(key, view)
      toast({ kind: 'success', title: 'Shard Core is in sync' })
    },
    onError: reportError,
    onSettled: invalidate
  })

  const importFiles = useMutation({
    mutationFn: (paths: string[]) =>
      invoke('mods:importFiles', { instanceId: requireInstance(instanceId), paths }),
    onSuccess: (mods) =>
      toast({
        kind: 'success',
        title: `Imported ${pluralize(mods.length, 'mod')}`,
        message: mods.map((m) => m.name).join(', ')
      }),
    onError: reportError,
    onSettled: invalidate
  })

  const importMrpack = useMutation({
    mutationFn: (path: string) =>
      invoke('mods:importMrpack', { instanceId: requireInstance(instanceId), path }),
    onSuccess: (result) =>
      toast({
        kind: 'success',
        title: `Imported ${result.name}`,
        message: `${pluralize(result.installed, 'mod')} installed${
          result.skipped.length ? `, ${result.skipped.length} skipped` : ''
        }`
      }),
    onError: reportError,
    onSettled: invalidate
  })

  const copyTo = useMutation({
    mutationFn: (toInstanceId: string) =>
      invoke('mods:copyTo', { fromInstanceId: requireInstance(instanceId), toInstanceId }),
    onSuccess: (_result, toInstanceId) =>
      void qc.invalidateQueries({ queryKey: queryKeys.mods(toInstanceId) }),
    onError: reportError
  })

  const openFile = (fileName: string): void => {
    void invoke('mods:openFile', { instanceId: requireInstance(instanceId), fileName }).catch(
      reportError
    )
  }

  const openFolder = (): void => {
    void invoke('instances:openFolder', { id: requireInstance(instanceId), sub: 'mods' }).catch(
      reportError
    )
  }

  return {
    setEnabled,
    setBundledEnabled,
    remove,
    update,
    updateAll,
    checkUpdates,
    syncBundled,
    importFiles,
    importMrpack,
    copyTo,
    openFile,
    openFolder
  }
}

export type ModsMutations = ReturnType<typeof useModsMutations>

/**
 * Opens the native file picker and routes the chosen files to the right import channel.
 * Drag-and-drop lands here too: the sandboxed renderer cannot read dropped file paths, so the
 * drop only pre-fills the picker's title and the user confirms the files there.
 */
export function useImportMods(m: ModsMutations): (droppedNames?: string[] | null) => Promise<void> {
  return async (droppedNames) => {
    const title =
      droppedNames && droppedNames.length > 0
        ? droppedNames.length === 1
          ? `Import ${droppedNames[0]}`
          : `Import ${droppedNames.length} dropped files`
        : 'Import mods'
    let paths: string[] | null
    try {
      paths = await invoke('app:pickFile', {
        title,
        filters: [{ name: 'Mods', extensions: ['jar', 'mrpack'] }],
        multiple: true
      })
    } catch (err) {
      reportError(err)
      return
    }
    if (!paths || paths.length === 0) return
    const { jars, mrpacks, other } = splitImportPaths(paths)
    if (other.length) {
      toast({
        kind: 'warning',
        title: `Skipped ${pluralize(other.length, 'file')}`,
        message: 'Only .jar mods and .mrpack packs can be imported.'
      })
    }
    // Errors are already toasted by the mutations; a failed jar import should not stop packs.
    if (jars.length) await m.importFiles.mutateAsync(jars).catch(() => undefined)
    for (const path of mrpacks) await m.importMrpack.mutateAsync(path).catch(() => undefined)
  }
}
