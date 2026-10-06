import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type AccountSummary, type LoginMethod } from '@shared/types'
import { invoke, queryKeys } from '@/lib/api'

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => invoke('auth:listAccounts'),
    staleTime: Infinity
  })
}

export function useActiveAccount(): AccountSummary | null {
  const { data } = useAccounts()
  return data?.find((a) => a.isActive) ?? null
}

export function useProfile(accountId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.profile(accountId),
    queryFn: () => invoke('auth:getProfile', { id: accountId ?? undefined }),
    enabled: enabled && accountId !== null,
    staleTime: 60_000
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (method: LoginMethod) => invoke('auth:login', { method }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts })
      void qc.invalidateQueries({ queryKey: ['auth', 'profile'] })
    }
  })
}

export function useSetActiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoke('auth:setActive', { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.accounts })
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoke('auth:logout', { id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts })
      void qc.invalidateQueries({ queryKey: ['auth', 'profile'] })
    }
  })
}

export function useRefreshAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoke('auth:refresh', { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.accounts })
  })
}
