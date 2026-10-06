import { Check, Moon, Palette, Sun } from 'lucide-react'
import { useState } from 'react'
import { type BackView, type ModelAnimation, type Theme } from '@shared/types'
import { cn } from '@/lib/cn'
import { ACCENT_PRESETS, isValidHex } from '@/lib/color'
import { useSettings } from '@/stores/settings'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { SettingRow, SettingsSection } from './SettingsSection'
import { useSettingsUpdate } from './useSettingsUpdate'

function normalizeHex(input: string): string {
  const v = input.trim().toUpperCase()
  return v.startsWith('#') ? v : `#${v}`
}

function AccentPicker() {
  const accent = useSettings((s) => s.settings.accent.toUpperCase())
  const previewAccent = useSettings((s) => s.previewAccent)
  const update = useSettingsUpdate()
  const [draft, setDraft] = useState(accent)
  const [syncedAccent, setSyncedAccent] = useState(accent)
  // Follow external changes (presets, rollbacks) without an effect.
  if (accent !== syncedAccent) {
    setSyncedAccent(accent)
    setDraft(accent)
  }

  const draftHex = normalizeHex(draft)
  const draftValid = isValidHex(draftHex)

  const revert = (): void => {
    setDraft(accent)
    previewAccent(accent)
  }
  const commit = (): void => {
    if (!draftValid) {
      revert()
      return
    }
    if (draftHex !== accent) void update({ accent: draftHex })
    else setDraft(accent)
  }
  const onDraft = (value: string): void => {
    setDraft(value)
    const hex = normalizeHex(value)
    if (isValidHex(hex)) previewAccent(hex)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Accent presets" className="flex flex-wrap items-center gap-2.5">
        {ACCENT_PRESETS.map((preset) => {
          const selected = preset.hex.toUpperCase() === accent
          return (
            <button
              key={preset.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.name}
              title={preset.name}
              onClick={() => void update({ accent: preset.hex.toUpperCase() })}
              className={cn(
                'press relative size-9 rounded-full border-2 transition-[transform,border-color,box-shadow] duration-200 hover:scale-110',
                selected ? 'border-white/90' : 'border-transparent hover:border-white/40'
              )}
              style={{ background: preset.hex, boxShadow: selected ? `0 0 0 3px ${preset.hex}55, 0 6px 18px -6px ${preset.hex}` : undefined }}
            >
              {selected && <Check className="absolute inset-0 m-auto size-4 text-black/80" strokeWidth={3} aria-hidden />}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pl-1">
        <label
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line-strong shadow-inner"
          style={{ background: draftValid ? draftHex : accent }}
          title="Pick a custom colour"
        >
          <input
            type="color"
            aria-label="Pick a custom accent colour"
            value={draftValid ? draftHex : accent}
            onInput={(e) => onDraft(e.currentTarget.value)}
            onChange={(e) => {
              const hex = normalizeHex(e.currentTarget.value)
              if (isValidHex(hex) && hex !== accent) void update({ accent: hex })
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          mono
          size="sm"
          aria-label="Custom accent hex"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              revert()
            }
          }}
          placeholder="#22D3EE"
          maxLength={7}
          spellCheck={false}
          error={draft.trim() !== '' && !draftValid ? 'Use #RRGGBB' : null}
          className="w-32"
        />
      </div>
    </div>
  )
}

export function AppearanceSection() {
  const theme = useSettings((s) => s.settings.theme)
  const viewer = useSettings((s) => s.settings.viewer)
  const update = useSettingsUpdate()

  return (
    <SettingsSection id="appearance" title="Appearance" description="Make the launcher yours." icon={<Palette />}>
      <SettingRow label="Accent colour" description="Buttons, focus rings, progress bars and the crystal glow follow it." stacked>
        <AccentPicker />
      </SettingRow>
      <SettingRow label="Theme" description="Dark is the polished one; light keeps every token readable.">
        <Tabs<Theme>
          size="sm"
          value={theme}
          onChange={(next) => void update({ theme: next })}
          items={[
            { value: 'dark', label: 'Dark', icon: <Moon /> },
            { value: 'light', label: 'Light', icon: <Sun /> }
          ]}
        />
      </SettingRow>
      <SettingRow label="3D player defaults" description="How the player model on Home animates. The card has the same toggles." stacked>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs<ModelAnimation>
            size="sm"
            value={viewer.animation}
            onChange={(animation) => void update({ viewer: { ...viewer, animation } })}
            items={[
              { value: 'idle', label: 'Idle' },
              { value: 'walk', label: 'Walk' },
              { value: 'run', label: 'Run' }
            ]}
          />
          <Tabs<BackView>
            size="sm"
            value={viewer.back}
            onChange={(back) => void update({ viewer: { ...viewer, back } })}
            items={[
              { value: 'cape', label: 'Cape' },
              { value: 'elytra', label: 'Elytra' }
            ]}
          />
          <Switch
            size="sm"
            checked={viewer.autoRotate}
            onCheckedChange={(autoRotate) => void update({ viewer: { ...viewer, autoRotate } })}
            label="Auto-rotate"
            className="gap-3"
          />
        </div>
      </SettingRow>
    </SettingsSection>
  )
}
