import { useQuery } from '@tanstack/react-query'
import { invoke, queryKeys } from '@/lib/api'

/** Fetches a skin/cape PNG through the main process (avoids CORS/CSP) as a data URL. */
export function useTexture(url: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.texture(url ?? ''),
    queryFn: () => invoke('skins:fetchTexture', { url: url! }),
    enabled: !!url,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000
  })
}
