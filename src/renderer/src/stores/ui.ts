import { useEffect, useState } from 'react'
import { create } from 'zustand'

export type Page =
  | 'home'
  | 'versions'
  | 'mods'
  | 'skins'
  | 'cosmetics'
  | 'codes'
  | 'friends'
  | 'updates'
  | 'settings'
  | 'admin'

/** Sidebar order. Admin is listed only for Shard admins. */
export const PAGES: Page[] = ['home', 'versions', 'mods', 'skins', 'cosmetics', 'codes', 'friends', 'updates', 'settings', 'admin']

export function isPage(value: string): value is Page {
  return (PAGES as string[]).includes(value)
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  message: string | null
  createdAt: number
  durationMs: number
  action?: { label: string; onClick: () => void }
}

export interface ToastInput {
  kind?: ToastKind
  title: string
  message?: string | null
  durationMs?: number
  action?: { label: string; onClick: () => void }
}

interface UiState {
  page: Page
  /**
   * A tab or value for the page just opened ("special" on Cosmetics, "codes" on Staff, a code on
   * Codes). Set by `navigate(page, hint)` (the dev screenshot harness sends "admin/codes"); the
   * page reads it once when it opens (usePageHint) and clears it.
   */
  pageHint: string | null
  /** Which instance the Mods tab and the Home launch button operate on. */
  selectedInstanceId: string | null
  toasts: Toast[]
  consoleOpen: boolean
  modrinthDrawerOpen: boolean
  whatsNewOpen: boolean
  /** App-level sign-in dialog, opened when the running game asks to add an account. */
  signInOpen: boolean
  navigate: (page: Page, hint?: string | null) => void
  clearPageHint: () => void
  selectInstance: (id: string | null) => void
  toast: (input: ToastInput) => string
  dismissToast: (id: string) => void
  setConsoleOpen: (open: boolean) => void
  setModrinthDrawerOpen: (open: boolean) => void
  setWhatsNewOpen: (open: boolean) => void
  setSignInOpen: (open: boolean) => void
}

let toastCounter = 0

export const useUi = create<UiState>((set) => ({
  page: 'home',
  pageHint: null,
  selectedInstanceId: null,
  toasts: [],
  consoleOpen: false,
  modrinthDrawerOpen: false,
  whatsNewOpen: false,
  signInOpen: false,
  navigate: (page, hint = null) => set({ page, pageHint: hint }),
  clearPageHint: () => set({ pageHint: null }),
  selectInstance: (id) => set({ selectedInstanceId: id }),
  toast: (input) => {
    const id = `t${++toastCounter}`
    const toast: Toast = {
      id,
      kind: input.kind ?? 'info',
      title: input.title,
      message: input.message ?? null,
      createdAt: Date.now(),
      durationMs: input.durationMs ?? (input.kind === 'error' ? 8000 : 4500),
      action: input.action
    }
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }))
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setConsoleOpen: (open) => set({ consoleOpen: open }),
  setModrinthDrawerOpen: (open) => set({ modrinthDrawerOpen: open }),
  setWhatsNewOpen: (open) => set({ whatsNewOpen: open }),
  setSignInOpen: (open) => set({ signInOpen: open })
}))

/** Convenience for non-React code. */
export const toast = (input: ToastInput): string => useUi.getState().toast(input)
export const navigate = (page: Page, hint?: string | null): void => useUi.getState().navigate(page, hint)

/** The hint this page was opened with (read once on mount, then cleared). */
export function usePageHint(page: Page): string | null {
  const [hint] = useState(() => {
    const { page: current, pageHint } = useUi.getState()
    return current === page ? pageHint : null
  })
  useEffect(() => {
    if (hint !== null) useUi.getState().clearPageHint()
  }, [hint])
  return hint
}
