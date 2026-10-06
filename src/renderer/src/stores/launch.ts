import { create } from 'zustand'
import { CONSOLE_BUFFER_LINES } from '@shared/constants'
import { type ConsoleLine, type LaunchProgress } from '@shared/types'
import { invoke } from '@/lib/api'

interface LaunchState {
  byInstance: Record<string, LaunchProgress>
  console: Record<string, ConsoleLine[]>
  hydrate: () => Promise<void>
  applyProgress: (progress: LaunchProgress) => void
  appendConsole: (instanceId: string, lines: ConsoleLine[]) => void
  loadConsole: (instanceId: string) => Promise<void>
  clearConsole: (instanceId: string) => void
}

export const useLaunch = create<LaunchState>((set, get) => ({
  byInstance: {},
  console: {},
  hydrate: async () => {
    const all = await invoke('launch:getAll')
    const byInstance: Record<string, LaunchProgress> = {}
    for (const p of all) byInstance[p.instanceId] = p
    set({ byInstance })
  },
  applyProgress: (progress) =>
    set((s) => ({ byInstance: { ...s.byInstance, [progress.instanceId]: progress } })),
  appendConsole: (instanceId, lines) =>
    set((s) => {
      const existing = s.console[instanceId] ?? []
      const merged = [...existing, ...lines]
      const trimmed = merged.length > CONSOLE_BUFFER_LINES ? merged.slice(-CONSOLE_BUFFER_LINES) : merged
      return { console: { ...s.console, [instanceId]: trimmed } }
    }),
  loadConsole: async (instanceId) => {
    const lines = await invoke('launch:getConsole', { instanceId })
    set((s) => ({ console: { ...s.console, [instanceId]: lines } }))
  },
  clearConsole: (instanceId) => {
    void invoke('launch:clearConsole', { instanceId })
    set((s) => ({ console: { ...s.console, [instanceId]: [] } }))
    void get()
  }
}))

export function useLaunchState(instanceId: string | null): LaunchProgress | null {
  return useLaunch((s) => (instanceId ? (s.byInstance[instanceId] ?? null) : null))
}

/** The launch that should drive the global status bar: an active preparation or running game. */
export function useActiveLaunch(): LaunchProgress | null {
  return useLaunch((s) => {
    const all = Object.values(s.byInstance)
    return (
      all.find((p) => p.phase === 'preparing') ??
      all.find((p) => p.phase === 'running') ??
      null
    )
  })
}

export const isBusy = (p: LaunchProgress | null): boolean =>
  !!p && (p.phase === 'preparing' || p.phase === 'running')
