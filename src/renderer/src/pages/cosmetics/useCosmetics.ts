import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type Cosmetic,
  type CosmeticSlot,
  type CosmeticsView,
  type EquippedCosmetics,
  type OnlineState
} from '@shared/types'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'
import { toggleEmoteList } from './cosmetics-utils'

export function reportError(err: unknown): void {
  toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
}

export function useCosmeticsView() {
  return useQuery({
    queryKey: queryKeys.cosmetics,
    queryFn: () => invoke('cosmetics:list', {}),
    staleTime: 5 * 60_000
  })
}

const REFRESH_MESSAGE: Record<CosmeticsView['source'], string> = {
  remote: 'Loaded the latest catalogue.',
  cache: 'Shard could not reach the catalogue; showing the cached copy.',
  bundled: 'Showing the catalogue bundled with the launcher.'
}

/** Equip/unequip and emote-wheel mutations with optimistic updates. */
export function useCosmeticsMutations() {
  const qc = useQueryClient()
  const key = queryKeys.cosmetics

  const patchEquipped = async (
    fn: (equipped: EquippedCosmetics) => EquippedCosmetics
  ): Promise<CosmeticsView | undefined> => {
    await qc.cancelQueries({ queryKey: key })
    const prev = qc.getQueryData<CosmeticsView>(key)
    if (prev) qc.setQueryData<CosmeticsView>(key, { ...prev, equipped: fn(prev.equipped) })
    return prev
  }

  const rollback = (err: unknown, prev: CosmeticsView | undefined): void => {
    if (prev) qc.setQueryData(key, prev)
    reportError(err)
  }

  const applyEquipped = (equipped: EquippedCosmetics): void => {
    qc.setQueryData<CosmeticsView>(key, (prev) => (prev ? { ...prev, equipped } : prev))
  }

  const refresh = useMutation({
    mutationFn: () => invoke('cosmetics:list', { refresh: true }),
    onSuccess: (view) => {
      qc.setQueryData(key, view)
      toast({
        kind: view.source === 'remote' ? 'success' : 'info',
        title: 'Cosmetics refreshed',
        message: REFRESH_MESSAGE[view.source]
      })
    },
    onError: reportError
  })

  const equip = useMutation({
    mutationFn: (vars: { type: CosmeticSlot; id: string | null }) =>
      invoke('cosmetics:equip', vars),
    onMutate: (vars) =>
      patchEquipped((eq) => {
        const { [vars.type]: _removed, ...rest } = eq.equipped
        return { ...eq, equipped: vars.id ? { ...rest, [vars.type]: vars.id } : rest }
      }),
    onError: (err, _vars, prev) => rollback(err, prev),
    onSuccess: (equipped, vars) => {
      applyEquipped(equipped)
      // Capes, shields and bandanas are mirrored to the Shard API; refresh what it says the player wears.
      if (vars.type === 'cape' || vars.type === 'shield' || vars.type === 'bandana')
        void qc.invalidateQueries({ queryKey: queryKeys.online })
    }
  })

  const toggleEmote = useMutation({
    mutationFn: (id: string) => invoke('cosmetics:toggleEmote', { id }),
    onMutate: (id) => patchEquipped((eq) => ({ ...eq, emotes: toggleEmoteList(eq.emotes, id) })),
    onError: (err, _id, prev) => rollback(err, prev),
    onSuccess: applyEquipped
  })

  return { refresh, equip, toggleEmote }
}

export type CosmeticsMutations = ReturnType<typeof useCosmeticsMutations>

/** Buys a cosmetic with Shard tokens. The caller confirms first. */
export function useBuyCosmetic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cosmetic: Cosmetic) => invoke('online:buy', { id: cosmetic.id }),
    onSuccess: (me, cosmetic) => {
      qc.setQueryData<OnlineState>(queryKeys.online, (prev) =>
        prev?.status === 'ready' ? { ...prev, me } : prev
      )
      toast({
        kind: 'success',
        title: `${cosmetic.name} is yours`,
        message: `${me.tokens} Shards left. Equip it whenever you like.`
      })
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'Could not buy it', message: errorMessage(err) })
      void qc.invalidateQueries({ queryKey: queryKeys.online })
    }
  })
}
