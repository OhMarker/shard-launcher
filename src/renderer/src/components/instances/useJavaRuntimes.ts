import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type JavaRuntime, type JavaValidation } from '@shared/types'
import { errorMessage, errorTitle, invoke, platform, queryKeys } from '@/lib/api'
import { useUi } from '@/stores/ui'

/** File picker filter for `app:pickFile`; Windows needs the .exe hint, elsewhere any file. */
export const JAVA_FILE_FILTERS = platform === 'win32' ? [{ name: 'Java executable', extensions: ['exe'] }] : undefined

export function useJavaRuntimes() {
  return useQuery({
    queryKey: queryKeys.java,
    queryFn: () => invoke('java:list'),
    staleTime: 60_000
  })
}

export function useRemoveJavaRuntime() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: (id: string) => invoke('java:remove', { id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.java }),
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export function useAddCustomJava() {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  return useMutation({
    mutationFn: (path: string) => invoke('java:addCustom', { path }),
    onSuccess: (runtime: JavaRuntime) => {
      void qc.invalidateQueries({ queryKey: queryKeys.java })
      toast({ kind: 'success', title: `Added Java ${runtime.major}`, message: runtime.version })
    },
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })
}

export function useValidateJava() {
  return useMutation({
    mutationFn: (path: string): Promise<JavaValidation> => invoke('java:validate', { path })
  })
}

/** Which runtimes the user may remove: anything the launcher or the user added, never a detected system JDK. */
export function isRemovableRuntime(runtime: JavaRuntime): boolean {
  return runtime.source !== 'system'
}

export const JAVA_SOURCE_LABELS: Record<JavaRuntime['source'], string> = {
  mojang: 'Mojang runtime',
  adoptium: 'Adoptium',
  custom: 'Custom',
  system: 'System'
}
