import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type OnlineState } from '@shared/types'
import { invoke, queryKeys } from '@/lib/api'

export type ReadyOnlineState = Extract<OnlineState, { status: 'ready' }>

/**
 * Shard API state for the active account: unavailable, signed out, error or ready (me + shop).
 * `pollMs` keeps the token balance fresh while a page that shows it is open.
 */
export function useOnlineState(opts: { pollMs?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.online,
    queryFn: () => invoke('online:state', {}),
    staleTime: 30_000,
    refetchInterval: opts.pollMs ?? false
  })
}

export function readyState(state: OnlineState | undefined): ReadyOnlineState | null {
  return state?.status === 'ready' ? state : null
}

/** True when the signed-in Shard player is an admin. */
export function useIsShardAdmin(): boolean {
  const { data } = useOnlineState()
  return readyState(data)?.me.admin ?? false
}

/** Looks for the API again right now (services.json and the session), skipping the short memo. */
export function useRefreshOnline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => invoke('online:state', { refresh: true }),
    onSuccess: (state) => qc.setQueryData(queryKeys.online, state)
  })
}
