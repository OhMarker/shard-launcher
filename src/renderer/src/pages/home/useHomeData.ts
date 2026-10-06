import { useQuery } from '@tanstack/react-query'
import { invoke, queryKeys } from '@/lib/api'

export function useNews() {
  return useQuery({
    queryKey: queryKeys.news,
    queryFn: () => invoke('news:minecraft'),
    staleTime: 15 * 60_000
  })
}

/** The crash report for the current crashed run; keyed by path so a new crash refetches. */
export function useCrashReport(instanceId: string | null, crashReportPath: string | null) {
  return useQuery({
    queryKey: ['launch', 'crash', instanceId, crashReportPath] as const,
    queryFn: () => invoke('launch:getCrashReport', { instanceId: instanceId! }),
    enabled: instanceId !== null,
    staleTime: Infinity
  })
}
