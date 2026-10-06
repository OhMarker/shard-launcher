import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShardError } from '@shared/errors'
import { type IpcInput } from '@shared/ipc'
import { type MinecraftProfile, type SavedSkin, type SkinVariant } from '@shared/types'
import { errorTitle, invoke, queryKeys } from '@/lib/api'
import { toast } from '@/stores/ui'
import { withCapeActive } from './skins-utils'

/** Mojang rate limits are expected and temporary, so they warn instead of erroring. */
export function reportSkinError(err: unknown): void {
  const e = ShardError.from(err)
  toast({
    kind: e.code === 'RATE_LIMITED' ? 'warning' : 'error',
    title: errorTitle(e),
    message: e.message
  })
}

export function useSkinLibrary() {
  return useQuery({
    queryKey: queryKeys.skins,
    queryFn: () => invoke('skins:library'),
    staleTime: 60_000
  })
}

type SkinPatch = IpcInput<'skins:update'>['patch']

const mergePatch = (skin: SavedSkin, patch: SkinPatch): SavedSkin => ({
  ...skin,
  name: patch.name ?? skin.name,
  favorite: patch.favorite ?? skin.favorite,
  variant: patch.variant ?? skin.variant
})

/** Profile and library mutations with optimistic updates that roll back on error. */
export function useSkinMutations(accountId: string | null) {
  const qc = useQueryClient()
  const profileKey = queryKeys.profile(accountId)

  const applyProfile = (profile: MinecraftProfile): void => {
    qc.setQueryData(profileKey, profile)
    // AccountSummary.skinUrl/capeUrl mirror the profile; the sidebar head must follow.
    void qc.invalidateQueries({ queryKey: queryKeys.accounts })
  }

  const upsertSkin = (skin: SavedSkin): void => {
    qc.setQueryData<SavedSkin[]>(queryKeys.skins, (prev) => [
      ...(prev ?? []).filter((s) => s.id !== skin.id),
      skin
    ])
  }

  const patchLibrary = async (
    updater: (skins: SavedSkin[]) => SavedSkin[]
  ): Promise<SavedSkin[] | undefined> => {
    await qc.cancelQueries({ queryKey: queryKeys.skins })
    const prev = qc.getQueryData<SavedSkin[]>(queryKeys.skins)
    if (prev) qc.setQueryData<SavedSkin[]>(queryKeys.skins, updater(prev))
    return prev
  }

  const rollbackLibrary = (err: unknown, prev: SavedSkin[] | undefined): void => {
    if (prev) qc.setQueryData(queryKeys.skins, prev)
    reportSkinError(err)
  }

  const added = (skin: SavedSkin): void => {
    upsertSkin(skin)
    toast({ kind: 'success', title: `Added ${skin.name} to your library` })
  }

  const apply = useMutation({
    mutationFn: (vars: { id: string; variant: SkinVariant }) => invoke('skins:apply', vars),
    onSuccess: applyProfile,
    onError: reportSkinError
  })

  const applyUrl = useMutation({
    mutationFn: (vars: { url: string; variant: SkinVariant }) => invoke('skins:applyUrl', vars),
    onSuccess: applyProfile,
    onError: reportSkinError
  })

  const reset = useMutation({
    mutationFn: () => invoke('skins:reset'),
    onSuccess: (profile) => {
      applyProfile(profile)
      toast({ kind: 'success', title: 'Skin reset to default' })
    },
    onError: reportSkinError
  })

  const setCape = useMutation({
    mutationFn: (capeId: string | null) => invoke('skins:setCape', { capeId }),
    onMutate: async (capeId) => {
      await qc.cancelQueries({ queryKey: profileKey })
      const prev = qc.getQueryData<MinecraftProfile>(profileKey)
      if (prev) qc.setQueryData(profileKey, withCapeActive(prev, capeId))
      return prev
    },
    onError: (err, _capeId, prev) => {
      if (prev) qc.setQueryData(profileKey, prev)
      reportSkinError(err)
    },
    onSuccess: applyProfile
  })

  const addFromFile = useMutation({
    mutationFn: (path: string) => invoke('skins:addFromFile', { path }),
    onSuccess: added,
    onError: reportSkinError
  })

  const addFromUsername = useMutation({
    mutationFn: (username: string) => invoke('skins:addFromUsername', { username }),
    onSuccess: added,
    onError: reportSkinError
  })

  const addFromUrl = useMutation({
    mutationFn: (url: string) => invoke('skins:addFromUrl', { url }),
    onSuccess: added,
    onError: reportSkinError
  })

  const saveCurrent = useMutation({
    mutationFn: () => invoke('skins:saveCurrent'),
    onSuccess: added,
    onError: reportSkinError
  })

  const update = useMutation({
    mutationFn: (vars: { id: string; patch: SkinPatch }) => invoke('skins:update', vars),
    onMutate: (vars) =>
      patchLibrary((skins) => skins.map((s) => (s.id === vars.id ? mergePatch(s, vars.patch) : s))),
    onError: (err, _vars, prev) => rollbackLibrary(err, prev),
    onSuccess: upsertSkin
  })

  const remove = useMutation({
    mutationFn: (id: string) => invoke('skins:delete', { id }),
    onMutate: (id) => patchLibrary((skins) => skins.filter((s) => s.id !== id)),
    onError: (err, _id, prev) => rollbackLibrary(err, prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.skins })
  })

  return {
    apply,
    applyUrl,
    reset,
    setCape,
    addFromFile,
    addFromUsername,
    addFromUrl,
    saveCurrent,
    update,
    remove
  }
}

export type SkinMutations = ReturnType<typeof useSkinMutations>
