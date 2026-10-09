import { QueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ERROR_TITLES, ShardError } from '@shared/errors'
import type { IpcChannel, IpcEventName, IpcEvents, IpcInput, IpcOutput } from '@shared/ipc'

/** Typed call into the main process. Rejections are always ShardError instances. */
export async function invoke<K extends IpcChannel>(
  channel: K,
  ...args: IpcInput<K> extends void ? [] : [input: IpcInput<K>]
): Promise<IpcOutput<K>> {
  try {
    return await window.shard.invoke(channel, ...args)
  } catch (err) {
    throw ShardError.from(err)
  }
}

export function onEvent<E extends IpcEventName>(
  event: E,
  listener: (payload: IpcEvents[E]) => void
): () => void {
  return window.shard.on(event, listener)
}

/** Subscribes to a main-process event for the lifetime of the component. */
export function useIpcEvent<E extends IpcEventName>(
  event: E,
  listener: (payload: IpcEvents[E]) => void
): void {
  const ref = useRef(listener)
  useEffect(() => {
    ref.current = listener
  }, [listener])
  useEffect(() => onEvent(event, (payload) => ref.current(payload)), [event])
}

export const platform = window.shard?.platform ?? 'win32'
export const isMac = platform === 'darwin'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        const code = error instanceof ShardError ? error.code : 'UNKNOWN'
        if (code === 'OFFLINE' || code === 'AUTH_NOT_CONFIGURED' || code === 'ACCOUNT_REQUIRED') return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false
    },
    mutations: { retry: 0 }
  }
})

export const queryKeys = {
  info: ['app', 'info'] as const,
  settings: ['settings'] as const,
  accounts: ['auth', 'accounts'] as const,
  profile: (id: string | null) => ['auth', 'profile', id] as const,
  versions: (snapshots: boolean) => ['versions', snapshots] as const,
  instances: ['instances'] as const,
  instance: (id: string) => ['instances', id] as const,
  launchAll: ['launch', 'all'] as const,
  console: (id: string) => ['launch', 'console', id] as const,
  java: ['java'] as const,
  mods: (id: string) => ['mods', id] as const,
  bundled: ['mods', 'bundled'] as const,
  modrinthSearch: (params: unknown) => ['modrinth', 'search', params] as const,
  modrinthProject: (id: string) => ['modrinth', 'project', id] as const,
  modrinthVersions: (id: string, mc: string) => ['modrinth', 'versions', id, mc] as const,
  skins: ['skins'] as const,
  texture: (url: string) => ['texture', url] as const,
  cosmetics: ['cosmetics'] as const,
  online: ['online'] as const,
  friends: ['friends'] as const,
  adminPlayers: (q: string) => ['admin', 'players', q] as const,
  adminStaff: ['admin', 'staff'] as const,
  shardManifest: ['shard', 'manifest'] as const,
  updates: ['updates'] as const,
  releaseNotes: ['updates', 'notes'] as const,
  news: ['news', 'minecraft'] as const
}

export function errorTitle(err: unknown): string {
  const e = ShardError.from(err)
  return ERROR_TITLES[e.code] ?? ERROR_TITLES.UNKNOWN
}

export function errorMessage(err: unknown): string {
  const e = ShardError.from(err)
  return e.message
}

export function openExternal(url: string): void {
  void invoke('app:openExternal', { url })
}
