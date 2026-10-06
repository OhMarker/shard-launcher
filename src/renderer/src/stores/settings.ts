import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '@shared/schemas/storage'
import { type Settings } from '@shared/types'
import { invoke, onEvent } from '@/lib/api'
import { applyAccent, applyTheme } from '@/lib/color'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<Settings>
  /** Applies accent locally without persisting (live preview while dragging a picker). */
  previewAccent: (hex: string) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await invoke('settings:get')
    applyAccent(settings.accent)
    applyTheme(settings.theme)
    set({ settings, loaded: true })
  },
  update: async (patch) => {
    const previous = get().settings
    const optimistic = { ...previous, ...patch }
    set({ settings: optimistic })
    if (patch.accent) applyAccent(patch.accent)
    if (patch.theme) applyTheme(patch.theme)
    try {
      const saved = await invoke('settings:update', patch)
      set({ settings: saved })
      return saved
    } catch (err) {
      set({ settings: previous })
      applyAccent(previous.accent)
      applyTheme(previous.theme)
      throw err
    }
  },
  previewAccent: (hex) => applyAccent(hex)
}))

let subscribed = false
export function subscribeSettings(): void {
  if (subscribed) return
  subscribed = true
  onEvent('settings:changed', (settings) => {
    applyAccent(settings.accent)
    applyTheme(settings.theme)
    useSettings.setState({ settings, loaded: true })
  })
}
