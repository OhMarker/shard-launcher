import { Link2, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { URLS } from '@shared/constants'
import { useSettings } from '@/stores/settings'
import { IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SettingRow, SettingsSection, SwitchRow } from './SettingsSection'
import { useSettingsUpdate } from './useSettingsUpdate'

const HTTP_URL_RE = /^https?:\/\/\S+$/i

function UrlOverride({
  label,
  description,
  value,
  placeholder,
  onCommit
}: {
  label: ReactNode
  description: ReactNode
  value: string | null
  placeholder: string
  onCommit: (value: string | null) => void
}) {
  const current = value ?? ''
  const [draft, setDraft] = useState(current)
  const [synced, setSynced] = useState(current)
  if (current !== synced) {
    setSynced(current)
    setDraft(current)
  }
  const trimmed = draft.trim()
  const valid = trimmed === '' || HTTP_URL_RE.test(trimmed)

  const commit = (): void => {
    if (!valid) return
    if (trimmed !== current) onCommit(trimmed === '' ? null : trimmed)
    else setDraft(current)
  }

  return (
    <SettingRow label={label} description={description} stacked>
      <Input
        mono
        size="sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(current)
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        error={valid ? null : 'Must be an http(s) URL'}
        rightSlot={
          value !== null ? (
            <IconButton label="Reset to the default URL" size="xs" onClick={() => onCommit(null)}>
              <RotateCcw />
            </IconButton>
          ) : undefined
        }
      />
    </SettingRow>
  )
}

export function IntegrationsSection() {
  const settings = useSettings((s) => s.settings)
  const update = useSettingsUpdate()
  const urls = settings.manifestUrls

  return (
    <SettingsSection id="integrations" title="Integrations" description="Discord, telemetry and where Shard fetches its manifests." icon={<Link2 />}>
      <SwitchRow
        label="Discord Rich Presence"
        description="Show the instance you are playing in your Discord status. Nothing is sent anywhere but your local Discord client."
        checked={settings.discordRpc}
        onCheckedChange={(discordRpc) => void update({ discordRpc })}
      />
      <SwitchRow
        label="Anonymous analytics"
        description="Shard never collects analytics unless you turn this on. Off by default."
        checked={settings.analytics}
        onCheckedChange={(analytics) => void update({ analytics })}
      />
      <UrlOverride
        label="Shard client manifest"
        description="Blank uses the official meta repository. Point it at a fork to test unreleased client builds."
        value={urls.shard}
        placeholder={URLS.shardManifest}
        onCommit={(shard) => void update({ manifestUrls: { ...urls, shard } })}
      />
      <UrlOverride
        label="Bundled mods manifest"
        description="Blank uses the official list. Override to try a different bundled mod set."
        value={urls.bundledMods}
        placeholder={URLS.bundledMods}
        onCommit={(bundledMods) => void update({ manifestUrls: { ...urls, bundledMods } })}
      />
      <UrlOverride
        label="Cosmetics manifest"
        description="Blank uses the official catalogue."
        value={urls.cosmetics}
        placeholder={URLS.cosmetics}
        onCommit={(cosmetics) => void update({ manifestUrls: { ...urls, cosmetics } })}
      />
    </SettingsSection>
  )
}
