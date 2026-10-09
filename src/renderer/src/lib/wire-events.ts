import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onEvent, queryKeys } from '@/lib/api'
import { useLaunch } from '@/stores/launch'
import { isPage, useUi } from '@/stores/ui'

/**
 * Wires main-process push events into the renderer's stores and query cache.
 * Mount once at the app root.
 */
export function useGlobalEvents(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const unsubs = [
      onEvent('app:toast', (t) => useUi.getState().toast({ kind: t.kind, title: t.title, message: t.message })),
      onEvent('app:navigate', ({ page }) => {
        if (isPage(page)) useUi.getState().navigate(page)
      }),
      onEvent('auth:signInRequested', () => useUi.getState().setSignInOpen(true)),
      onEvent('auth:accountsChanged', (accounts) => {
        qc.setQueryData(queryKeys.accounts, accounts)
        void qc.invalidateQueries({ queryKey: ['auth', 'profile'] })
        // The Shard API session belongs to the active account.
        void qc.invalidateQueries({ queryKey: queryKeys.online })
        void qc.invalidateQueries({ queryKey: queryKeys.friends })
        void qc.invalidateQueries({ queryKey: ['admin'] })
      }),
      onEvent('instances:changed', (instances) => {
        qc.setQueryData(queryKeys.instances, instances)
        void qc.invalidateQueries({ queryKey: ['versions'] })
      }),
      onEvent('mods:changed', ({ instanceId }) => {
        void qc.invalidateQueries({ queryKey: queryKeys.mods(instanceId) })
      }),
      onEvent('launch:progress', (progress) => {
        const prev = useLaunch.getState().byInstance[progress.instanceId]
        useLaunch.getState().applyProgress(progress)
        if (prev && prev.phase !== progress.phase && (progress.phase === 'exited' || progress.phase === 'crashed')) {
          void qc.invalidateQueries({ queryKey: queryKeys.instances })
        }
        if (progress.mode !== 'launch' && (progress.phase === 'exited' || progress.phase === 'idle')) {
          void qc.invalidateQueries({ queryKey: queryKeys.instances })
          void qc.invalidateQueries({ queryKey: queryKeys.mods(progress.instanceId) })
        }
      }),
      onEvent('launch:console', ({ instanceId, lines }) => useLaunch.getState().appendConsole(instanceId, lines)),
      onEvent('cosmetics:changed', () => void qc.invalidateQueries({ queryKey: queryKeys.cosmetics })),
      onEvent('updates:state', (state) => qc.setQueryData(queryKeys.updates, state))
    ]
    void useLaunch.getState().hydrate()
    return () => unsubs.forEach((u) => u())
  }, [qc])
}
