import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type InstanceSummary } from '@shared/types'
import { invoke, queryKeys } from '@/lib/api'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

export function useInstances() {
  return useQuery({
    queryKey: queryKeys.instances,
    queryFn: () => invoke('instances:list'),
    staleTime: 15_000
  })
}

export function useInstance(id: string | null): InstanceSummary | null {
  const { data } = useInstances()
  return (id && data?.find((i) => i.id === id)) || null
}

/**
 * The instance the Home launch button targets: the explicitly selected one, else the
 * default from settings, else the most recently played, else the first.
 */
export function useSelectedInstance(): InstanceSummary | null {
  const { data } = useInstances()
  const selectedId = useUi((s) => s.selectedInstanceId)
  const defaultId = useSettings((s) => s.settings.defaultInstanceId)
  if (!data || data.length === 0) return null
  return (
    data.find((i) => i.id === selectedId) ??
    data.find((i) => i.id === defaultId) ??
    [...data].sort((a, b) => Date.parse(b.lastPlayedAt ?? '0') - Date.parse(a.lastPlayedAt ?? '0'))[0] ??
    null
  )
}

export function useInvalidateInstances() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.instances })
    void qc.invalidateQueries({ queryKey: ['versions'] })
  }
}

export function useDeleteInstance() {
  const invalidate = useInvalidateInstances()
  return useMutation({
    mutationFn: (id: string) => invoke('instances:delete', { id }),
    onSuccess: invalidate
  })
}

export function useLaunchInstance() {
  return useMutation({
    mutationFn: (instanceId: string) => invoke('launch:start', { instanceId })
  })
}

export function useKillInstance() {
  return useMutation({
    mutationFn: (instanceId: string) => invoke('launch:kill', { instanceId })
  })
}
