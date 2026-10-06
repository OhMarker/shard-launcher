import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type InstanceSummary, type InstanceType, type LaunchProgress, type VersionEntry } from '@shared/types'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { useUi } from '@/stores/ui'

export function useVersions(includeSnapshots: boolean) {
  return useQuery({
    queryKey: queryKeys.versions(includeSnapshots),
    queryFn: () => invoke('versions:list', { includeSnapshots }),
    staleTime: 5 * 60_000
  })
}

/** Forces a manifest download (bypassing the cache) and swaps it into the query. */
export function useRefreshVersions(includeSnapshots: boolean) {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: () => invoke('versions:list', { includeSnapshots, refresh: true }),
    onSuccess: (list) => qc.setQueryData(queryKeys.versions(includeSnapshots), list),
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export interface InstallInput {
  minecraftVersion: string
  type: InstanceType
}

/** Creates an instance for a version; preparation continues in the background (see launch progress). */
export function useInstallVersion() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const navigate = useUi((s) => s.navigate)
  const selectInstance = useUi((s) => s.selectInstance)
  return useMutation({
    mutationFn: (input: InstallInput) => invoke('versions:install', input),
    onSuccess: (instance) => {
      selectInstance(instance.id)
      void qc.invalidateQueries({ queryKey: queryKeys.instances })
      void qc.invalidateQueries({ queryKey: ['versions'] })
      toast({
        kind: 'info',
        title: `Installing ${instance.name}`,
        message: 'Downloads continue in the background.',
        action: { label: 'Show progress', onClick: () => navigate('home') }
      })
    },
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export function useCreateInstance() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: (input: { name: string; minecraftVersion: string; type: InstanceType }) => invoke('instances:create', input),
    onSuccess: (instance) => {
      void qc.invalidateQueries({ queryKey: queryKeys.instances })
      void qc.invalidateQueries({ queryKey: ['versions'] })
      toast({ kind: 'success', title: `Created ${instance.name}`, message: 'It installs on first launch.' })
    },
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export function useCancelPrepare() {
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: (id: string) => invoke('instances:cancelPrepare', { id }),
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

/** The install/repair currently running for any instance of a version, if one is. */
export function findActiveInstall(
  instanceIds: readonly string[],
  byInstance: Record<string, LaunchProgress>
): LaunchProgress | null {
  for (const id of instanceIds) {
    const p = byInstance[id]
    if (p && p.phase === 'preparing' && p.mode !== 'launch') return p
  }
  return null
}

/**
 * Instances belonging to a version: the ids the manifest knows about plus any instance
 * created a moment ago that the version list has not been refreshed for yet.
 */
export function instancesForVersion(entry: VersionEntry, instances: readonly InstanceSummary[] | undefined): InstanceSummary[] {
  if (!instances) return []
  const ids = new Set(entry.instanceIds)
  return instances.filter((i) => ids.has(i.id) || i.minecraftVersion === entry.id)
}
