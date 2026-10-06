import { Coffee } from 'lucide-react'
import { useState } from 'react'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { useSettings } from '@/stores/settings'
import { Textarea } from '@/components/ui/Input'
import { JavaRuntimesList } from '@/components/instances/JavaRuntimesList'
import { MemorySlider } from '@/components/instances/MemorySlider'
import { joinArgs, splitArgs } from '@/components/instances/instance-helpers'
import { SettingRow, SettingsSection } from './SettingsSection'
import { useSettingsUpdate } from './useSettingsUpdate'

function JvmArgsField() {
  const java = useSettings((s) => s.settings.java)
  const update = useSettingsUpdate()
  const current = joinArgs(java.jvmArgs)
  const [draft, setDraft] = useState(current)
  const [synced, setSynced] = useState(current)
  if (current !== synced) {
    setSynced(current)
    setDraft(current)
  }

  const commit = (): void => {
    const next = splitArgs(draft)
    if (joinArgs(next) !== current) void update({ java: { ...java, jvmArgs: next } })
    else setDraft(current)
  }

  return (
    <Textarea
      mono
      rows={2}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=40"
      spellCheck={false}
      aria-label="Default extra JVM arguments"
    />
  )
}

export function JavaSection() {
  const java = useSettings((s) => s.settings.java)
  const update = useSettingsUpdate()
  const { data: info } = useSystemInfo()
  const [memoryDraft, setMemoryDraft] = useState<number | null>(null)

  return (
    <SettingsSection id="java" title="Java" description="Defaults for new instances and the runtimes Shard manages." icon={<Coffee />}>
      <SettingRow label="Default memory" description="New instances start with this allocation. Existing instances keep their own value." stacked>
        <MemorySlider
          value={memoryDraft ?? java.memoryMb}
          onChange={setMemoryDraft}
          onCommit={(memoryMb) => {
            void update({ java: { ...java, memoryMb } }).finally(() => setMemoryDraft(null))
          }}
          totalMemoryMb={info?.totalMemoryMb}
          label="Allocated to Minecraft"
        />
      </SettingRow>
      <SettingRow label="Default extra JVM arguments" description="Added after the memory flags on every launch. Quote values that contain spaces." stacked>
        <JvmArgsField />
      </SettingRow>
      <SettingRow
        label="Java runtimes"
        description="Managed runtimes are downloaded per Minecraft version. Add your own JDK to pick it in an instance's settings."
        stacked
      >
        <JavaRuntimesList allowValidate allowAdd />
      </SettingRow>
    </SettingsSection>
  )
}
