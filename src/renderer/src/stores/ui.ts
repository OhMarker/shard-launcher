import { create } from 'zustand'

export type Page = 'home' | 'versions' | 'mods' | 'skins' | 'cosmetics' | 'updates' | 'settings'

export const PAGES: Page[] = ['home', 'versions', 'mods', 'skins', 'cosmetics', 'updates', 'settings']

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
  /** Which instance the Mods tab and the Home launch button operate on. */
  selectedInstanceId: string | null
  toasts: Toast[]
  consoleOpen: boolean
  modrinthDrawerOpen: boolean
  whatsNewOpen: boolean
  navigate: (page: Page) => void
  selectInstance: (id: string | null) => void
  toast: (input: ToastInput) => string
  dismissToast: (id: string) => void
  setConsoleOpen: (open: boolean) => void
  setModrinthDrawerOpen: (open: boolean) => void
  setWhatsNewOpen: (open: boolean) => void
}

let toastCounter = 0

export const useUi = create<UiState>((set) => ({
  page: 'home',
  selectedInstanceId: null,
  toasts: [],
  consoleOpen: false,
  modrinthDrawerOpen: false,
  whatsNewOpen: false,
  navigate: (page) => set({ page }),
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
  setWhatsNewOpen: (open) => set({ whatsNewOpen: open })
}))

/** Convenience for non-React code. */
export const toast = (input: ToastInput): string => useUi.getState().toast(input)
export const navigate = (page: Page): void => useUi.getState().navigate(page)
