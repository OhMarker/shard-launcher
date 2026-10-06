import { useQuery } from '@tanstack/react-query'
import { invoke, queryKeys } from '@/lib/api'

export function useSystemInfo() {
  return useQuery({
    queryKey: queryKeys.info,
    queryFn: () => invoke('app:info'),
    staleTime: 60_000
  })
}
