import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { useUi } from '@/stores/ui'

/** Launcher auto-update state. `updates:state` events keep this key fresh. */
export function useUpdateState() {
  return useQuery({
    queryKey: queryKeys.updates,
    queryFn: () => invoke('updates:getState'),
    staleTime: 60_000
  })
}

export function useReleaseNotes() {
  return useQuery({
    queryKey: queryKeys.releaseNotes,
    queryFn: () => invoke('updates:releaseNotes'),
    staleTime: 10 * 60_000
  })
}

export function useShardManifest() {
  return useQuery({
    queryKey: queryKeys.shardManifest,
    queryFn: () => invoke('shard:manifest', {}),
    staleTime: 5 * 60_000
  })
}

export function useRefreshShardManifest() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: () => invoke('shard:manifest', { refresh: true }),
    onSuccess: (view) => qc.setQueryData(queryKeys.shardManifest, view),
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export function useUpdateActions() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const fail = (err: unknown): void => {
    toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  }
  const check = useMutation({
    mutationFn: () => invoke('updates:check'),
    onSuccess: (state) => qc.setQueryData(queryKeys.updates, state),
    onError: fail
  })
  const download = useMutation({ mutationFn: () => invoke('updates:download'), onError: fail })
  const install = useMutation({ mutationFn: () => invoke('updates:install'), onError: fail })
  return { check, download, install }
}
