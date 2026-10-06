import { Rocket } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_DOWNLOAD_CONCURRENCY, MAX_DOWNLOAD_CONCURRENCY, MIN_DOWNLOAD_CONCURRENCY } from '@shared/constants'
import { type LaunchBehavior } from '@shared/types'
import { useInstances } from '@/hooks/useInstances'
import { useSettings } from '@/stores/settings'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { SettingRow, SettingsSection, SwitchRow } from './SettingsSection'
import { useSettingsUpdate } from './useSettingsUpdate'

const LAUNCH_BEHAVIOURS: ReadonlyArray<SelectOption<LaunchBehavior>> = [
  { value: 'keep', label: 'Keep the launcher open' },
  { value: 'minimize', label: 'Minimize the launcher' },
  { value: 'close', label: 'Close the launcher' }
]

const MOST_RECENT = ''

export function LaunchSection() {
  const settings = useSettings((s) => s.settings)
  const update = useSettingsUpdate()
  const { data: instances } = useInstances()
  const [concurrencyDraft, setConcurrencyDraft] = useState<number | null>(null)

  const defaultValue = settings.defaultInstanceId ?? MOST_RECENT
  const instanceOptions: SelectOption[] = [
    { value: MOST_RECENT, label: 'Most recently played' },
    ...(instances ?? []).map((i) => ({ value: i.id, label: `${i.name} · ${i.minecraftVersion}` }))
  ]
  if (defaultValue !== MOST_RECENT && !instanceOptions.some((o) => o.value === defaultValue)) {
    instanceOptions.push({ value: defaultValue, label: 'Deleted instance' })
  }

  return (
    <SettingsSection id="launch" title="Launch" description="What happens when you press the big button." icon={<Rocket />}>
      <SettingRow label="Default instance" description="What LAUNCH targets until you pick another one from its menu.">
        <Select
          value={defaultValue}
          onChange={(value) => void update({ defaultInstanceId: value === MOST_RECENT ? null : value })}
          options={instanceOptions}
          aria-label="Default instance"
          className="w-72"
        />
      </SettingRow>
      <SettingRow label="When the game starts" description="Launcher window behaviour while Minecraft is running.">
        <Select<LaunchBehavior>
          value={settings.launchBehavior}
          onChange={(launchBehavior) => void update({ launchBehavior })}
          options={LAUNCH_BEHAVIOURS}
          aria-label="Launch behaviour"
          className="w-72"
        />
      </SettingRow>
      <SwitchRow
        label="Close to tray"
        description="Closing the window keeps Shard running in the system tray so Rich Presence and downloads continue."
        checked={settings.closeToTray}
        onCheckedChange={(closeToTray) => void update({ closeToTray })}
      />
      <SwitchRow
        label="Keep bundled mods up to date"
        description="Check the bundled mod set against Modrinth before each launch and install newer compatible files."
        checked={settings.autoUpdateMods}
        onCheckedChange={(autoUpdateMods) => void update({ autoUpdateMods })}
      />
      <SwitchRow
        label="Shared config layer"
        description="Options, keybinds, server list and bundled mod configs stay identical across all instances: changes made in one game session are synced back after exit. Instances can opt out individually."
        checked={settings.sharedConfig}
        onCheckedChange={(sharedConfig) => void update({ sharedConfig })}
      />
      <SettingRow label="Download concurrency" description="Parallel connections while installing. Lower it on flaky connections, raise it on fast ones." stacked>
        <Slider
          value={concurrencyDraft ?? settings.downloadConcurrency}
          min={MIN_DOWNLOAD_CONCURRENCY}
          max={MAX_DOWNLOAD_CONCURRENCY}
          step={1}
          onChange={setConcurrencyDraft}
          onCommit={(value) => {
            void update({ downloadConcurrency: value }).finally(() => setConcurrencyDraft(null))
          }}
          label="Connections"
          format={(v) => `${v}`}
          marks={[{ value: DEFAULT_DOWNLOAD_CONCURRENCY, label: 'Default' }]}
        />
      </SettingRow>
    </SettingsSection>
  )
}
