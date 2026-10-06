import { type ReactNode } from 'react'
import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  ask: (opts: ConfirmOptions) => Promise<boolean>
  settle: (ok: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      get().current?.resolve(false)
      set({ current: { ...opts, resolve } })
    }),
  settle: (ok) => {
    get().current?.resolve(ok)
    set({ current: null })
  }
}))

/** Imperative confirmation dialog. Resolves true when the user confirms. */
export const confirm = (opts: ConfirmOptions): Promise<boolean> => useConfirmStore.getState().ask(opts)
