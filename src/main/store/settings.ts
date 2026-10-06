import Store from 'electron-store'
import { DEFAULT_SETTINGS, SettingsSchema } from '@shared/schemas/storage'
import { type Settings } from '@shared/types'
import { createLogger } from '../logger'

const log = createLogger('settings')

type Listener = (settings: Settings, previous: Settings) => void

/**
 * electron-store backed settings with Zod validation on load. Invalid keys fall back to
 * their defaults individually so one bad value never wipes the whole file.
 */
export class SettingsStore {
  private readonly store: Store<Record<string, unknown>>
  private current: Settings
  private readonly listeners = new Set<Listener>()

  constructor(configDir: string) {
    this.store = new Store<Record<string, unknown>>({
      cwd: configDir,
      name: 'settings',
      clearInvalidConfig: false
    })
    this.current = this.load()
    this.persist()
  }

  get path(): string {
    return this.store.path
  }

  private load(): Settings {
    const raw: Record<string, unknown> = { ...this.store.store }
    const full = SettingsSchema.safeParse(raw)
    if (full.success) return full.data

    log.warn('settings.json failed validation, repairing invalid keys', full.error.issues.slice(0, 5))
    const repaired: Record<string, unknown> = {}
    for (const key of Object.keys(SettingsSchema.shape) as Array<keyof Settings>) {
      const single = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [key]: raw[key] })
      repaired[key] = single.success ? single.data[key] : DEFAULT_SETTINGS[key]
    }
    return SettingsSchema.parse(repaired)
  }

  private persist(): void {
    this.store.store = { ...this.current }
  }

  get(): Settings {
    return this.current
  }

  update(patch: Partial<Settings>): Settings {
    const previous = this.current
    const merged = SettingsSchema.parse({ ...previous, ...patch })
    this.current = merged
    this.persist()
    for (const l of this.listeners) {
      try {
        l(merged, previous)
      } catch (err) {
        log.error('settings listener failed', err)
      }
    }
    return merged
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  reset(): Settings {
    return this.update({ ...DEFAULT_SETTINGS, onboarded: true })
  }
}
