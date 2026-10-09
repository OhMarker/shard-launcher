import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type AdminPlayer, type AdminShopItem, type OnlineState, type PromoCode, type PromoCodeInput, type ShopItem } from '@shared/types'
import { errorMessage, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'

export function useAdminPlayers(q: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminPlayers(q),
    queryFn: () => invoke('admin:players', { q }),
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData
  })
}

/** Owners, admins and mods (mod+). */
export function useAdminStaff(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminStaff,
    queryFn: () => invoke('admin:staff'),
    enabled,
    staleTime: 10_000
  })
}

/** Every shop item (hidden ones too) with sold counts. Owners and admins only. */
export function useAdminShop(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminShop,
    queryFn: () => invoke('admin:shop'),
    enabled,
    staleTime: 10_000
  })
}

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: () => invoke('admin:stats'),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 60_000 : false
  })
}

export function useAdminCodes(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminCodes,
    queryFn: () => invoke('admin:codes'),
    enabled,
    staleTime: 10_000
  })
}

/** The public shop from the admin list: hidden items are not for sale. */
function publicShop(items: readonly AdminShopItem[]): ShopItem[] {
  return items.filter((item) => !item.hidden).map(({ hidden: _hidden, sold: _sold, ...item }) => item)
}

/** Admin writes. Each returns the updated player (or shop), which is patched into every cached search. */
export function useAdminMutations(selfUuid: string | null) {
  const qc = useQueryClient()

  const applyPlayer = (player: AdminPlayer): void => {
    qc.setQueriesData<AdminPlayer[]>({ queryKey: ['admin', 'players'] }, (list) =>
      list?.map((p) => (p.uuid === player.uuid ? player : p))
    )
    // Changing your own balance or wardrobe shows up on the Cosmetics page too.
    if (player.uuid === selfUuid) void qc.invalidateQueries({ queryKey: queryKeys.online })
  }
  const fail = (title: string) => (err: unknown) => toast({ kind: 'error', title, message: errorMessage(err) })

  const tokens = useMutation({
    mutationFn: (vars: { player: string; amount: number }) => invoke('admin:tokens', vars),
    onSuccess: (player, vars) => {
      applyPlayer(player)
      toast({
        kind: 'success',
        title: vars.amount >= 0 ? `Gave ${vars.amount} tokens to ${player.name}` : `Took ${-vars.amount} tokens from ${player.name}`,
        message: `${player.name} now has ${player.tokens} tokens.`
      })
    },
    onError: fail('Could not change the tokens')
  })

  const grant = useMutation({
    mutationFn: (vars: { player: string; id: string }) => invoke('admin:grant', vars),
    onSuccess: applyPlayer,
    onError: fail('Could not grant it')
  })

  const revoke = useMutation({
    mutationFn: (vars: { player: string; id: string }) => invoke('admin:revoke', vars),
    onSuccess: applyPlayer,
    onError: fail('Could not revoke it')
  })

  const price = useMutation({
    mutationFn: (vars: { id: string; price: number | null }) => invoke('admin:price', vars),
    onSuccess: (shop, vars) => {
      qc.setQueryData<OnlineState>(queryKeys.online, (prev) => (prev?.status === 'ready' ? { ...prev, shop } : prev))
      void qc.invalidateQueries({ queryKey: queryKeys.adminShop })
      toast({
        kind: 'success',
        title: vars.price === null ? 'Removed from the shop' : 'Price saved',
        message: vars.price === null ? `${vars.id} is no longer for sale.` : `${vars.id} now costs ${vars.price} tokens.`
      })
    },
    onError: fail('Could not change the shop')
  })

  // Errors show inline in the Roles section (the mutation keeps them), not as a toast.
  const role = useMutation({
    mutationFn: (vars: { player: string; role: 'admin' | 'mod' | null }) => invoke('admin:role', vars),
    onSuccess: (player) => {
      applyPlayer(player)
      void qc.invalidateQueries({ queryKey: queryKeys.adminStaff })
      toast({
        kind: 'success',
        title: player.role ? `${player.name} is now ${player.role === 'admin' ? 'an admin' : 'a mod'}` : `${player.name} has no role now`
      })
    }
  })

  const shopUpdate = useMutation({
    mutationFn: (vars: { id: string; hidden?: boolean; salePercent?: number }) => invoke('admin:shopUpdate', vars),
    onSuccess: (items, vars) => {
      qc.setQueryData(queryKeys.adminShop, items)
      qc.setQueryData<OnlineState>(queryKeys.online, (prev) =>
        prev?.status === 'ready' ? { ...prev, shop: publicShop(items) } : prev
      )
      toast({
        kind: 'success',
        title:
          vars.hidden !== undefined
            ? vars.hidden
              ? 'Hidden from the shop'
              : 'Back in the shop'
            : vars.salePercent
              ? `${vars.salePercent}% sale saved`
              : 'Sale ended'
      })
    },
    onError: fail('Could not change the shop')
  })

  const patchCodes = (fn: (codes: PromoCode[]) => PromoCode[]): void => {
    qc.setQueryData<PromoCode[]>(queryKeys.adminCodes, (codes) => (codes ? fn(codes) : codes))
    void qc.invalidateQueries({ queryKey: queryKeys.adminStats })
  }
  const upsert = (code: PromoCode) =>
    patchCodes((codes) =>
      codes.some((c) => c.code === code.code) ? codes.map((c) => (c.code === code.code ? code : c)) : [code, ...codes]
    )

  // Save errors show in the form; the toggle and row actions toast.
  const codeSave = useMutation({
    mutationFn: (input: PromoCodeInput) => invoke('admin:codeSave', input),
    onSuccess: upsert
  })
  const codeReset = useMutation({
    mutationFn: (code: string) => invoke('admin:codeReset', { code }),
    onSuccess: (code) => {
      upsert(code)
      toast({ kind: 'success', title: `${code.code} reset`, message: `Round ${code.round}: everyone can use it once more.` })
    },
    onError: fail('Could not reset the code')
  })
  const codeDelete = useMutation({
    mutationFn: (code: string) => invoke('admin:codeDelete', { code }),
    onSuccess: ({ deleted }) => {
      patchCodes((codes) => codes.filter((c) => c.code !== deleted))
      toast({ kind: 'success', title: `${deleted} deleted` })
    },
    onError: fail('Could not delete the code')
  })

  return { tokens, grant, revoke, price, role, shopUpdate, codeSave, codeReset, codeDelete }
}

export type AdminMutations = ReturnType<typeof useAdminMutations>
