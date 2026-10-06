import { useCallback } from 'react'
import { type Settings } from '@shared/types'
import { errorMessage, errorTitle } from '@/lib/api'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

/**
 * Persists a settings patch. The store applies it optimistically and rolls back on
 * failure; this hook adds the error toast so every control can fire-and-forget.
 * Resolves to whether the save succeeded.
 */
export function useSettingsUpdate(): (patch: Partial<Settings>) => Promise<boolean> {
  const update = useSettings((s) => s.update)
  const toast = useUi((s) => s.toast)
  return useCallback(
    async (patch: Partial<Settings>) => {
      try {
        await update(patch)
        return true
      } catch (err) {
        toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
        return false
      }
    },
    [update, toast]
  )
}
