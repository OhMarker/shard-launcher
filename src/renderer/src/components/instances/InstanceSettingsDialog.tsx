import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, FolderOpen, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { type InstanceSummary, type JavaValidation } from '@shared/types'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { errorMessage, errorTitle, invoke, queryKeys } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Divider, SectionHeader } from '@/components/ui/Misc'
import { Switch } from '@/components/ui/Switch'
import { joinArgs, splitArgs } from './instance-helpers'
import { JavaRuntimesList } from './JavaRuntimesList'
import { MemorySlider } from './MemorySlider'
import { JAVA_FILE_FILTERS, useValidateJava } from './useJavaRuntimes'

export interface InstanceSettingsDialogProps {
  instance: InstanceSummary
  open: boolean
  onClose: () => void
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 240

function parseDimension(value: string, min: number): { value: number; error: string | null } {
  const n = Number(value)
  if (value.trim() === '' || !Number.isInteger(n)) return { value: n, error: 'Whole number' }
  if (n < min) return { value: n, error: `At least ${min}` }
  return { value: n, error: null }
}

function SettingsForm({ instance, onClose }: { instance: InstanceSummary; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useUi((s) => s.toast)
  const { data: info } = useSystemInfo()
  const globalSharedConfig = useSettings((s) => s.settings.sharedConfig)
  const validateJava = useValidateJava()
  const current = instance.settings

  const [memoryMb, setMemoryMb] = useState(current.memoryMb)
  const [width, setWidth] = useState(String(current.width))
  const [height, setHeight] = useState(String(current.height))
  const [fullscreen, setFullscreen] = useState(current.fullscreen)
  const [jvmArgs, setJvmArgs] = useState(joinArgs(current.jvmArgs))
  const [gameArgs, setGameArgs] = useState(joinArgs(current.gameArgs))
  const [preLaunchHook, setPreLaunchHook] = useState(current.preLaunchHook)
  const [postExitHook, setPostExitHook] = useState(current.postExitHook)
  const [sharedConfig, setSharedConfig] = useState(current.sharedConfig)
  const [javaPath, setJavaPath] = useState(current.javaPath ?? '')
  const [validation, setValidation] = useState<JavaValidation | null>(null)

  const widthParsed = parseDimension(width, MIN_WIDTH)
  const heightParsed = parseDimension(height, MIN_HEIGHT)
  const valid = widthParsed.error === null && heightParsed.error === null

  const save = useMutation({
    mutationFn: () =>
      invoke('instances:update', {
        id: instance.id,
        patch: {
          settings: {
            memoryMb,
            width: widthParsed.value,
            height: heightParsed.value,
            fullscreen,
            jvmArgs: splitArgs(jvmArgs),
            gameArgs: splitArgs(gameArgs),
            preLaunchHook: preLaunchHook.trim(),
            postExitHook: postExitHook.trim(),
            sharedConfig,
            javaPath: javaPath.trim() === '' ? null : javaPath.trim()
          }
        }
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.instances })
      toast({ kind: 'success', title: 'Instance settings saved', message: `Applies to the next launch of ${instance.name}.` })
      onClose()
    },
    onError: (err) => toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
  })

  const browseJava = async (): Promise<void> => {
    const picked = await invoke('app:pickFile', { title: 'Choose a java executable', filters: JAVA_FILE_FILTERS }).catch(
      (err: unknown) => {
        toast({ kind: 'error', title: errorTitle(err), message: errorMessage(err) })
        return null
      }
    )
    const path = picked?.[0]
    if (path) {
      setJavaPath(path)
      setValidation(null)
    }
  }

  const runValidation = (): void => {
    const path = javaPath.trim()
    if (!path) return
    validateJava.mutate(path, {
      onSuccess: setValidation,
      onError: (err) => setValidation({ valid: false, version: null, major: null, error: errorMessage(err) })
    })
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !save.isPending) save.mutate()
      }}
    >
      <section className="space-y-3">
        <SectionHeader size="sm" title="Memory" />
        <MemorySlider value={memoryMb} onChange={setMemoryMb} totalMemoryMb={info?.totalMemoryMb} label="Allocated to Minecraft" />
      </section>

      <Divider />

      <section className="space-y-3">
        <SectionHeader size="sm" title="Window" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_WIDTH}
              step={1}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              error={widthParsed.error}
              disabled={fullscreen}
              mono
            />
          </Field>
          <Field label="Height">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_HEIGHT}
              step={1}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              error={heightParsed.error}
              disabled={fullscreen}
              mono
            />
          </Field>
        </div>
        <Switch
          checked={fullscreen}
          onCheckedChange={setFullscreen}
          label="Fullscreen"
          description="Start the game in fullscreen on the primary display."
        />
      </section>

      <Divider />

      <section className="space-y-3">
        <SectionHeader size="sm" title="Arguments" />
        <Field label="Extra JVM arguments" hint="Added after the memory flags. Quote values that contain spaces.">
          <Textarea
            value={jvmArgs}
            onChange={(e) => setJvmArgs(e.target.value)}
            placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=40"
            rows={2}
            spellCheck={false}
            mono
          />
        </Field>
        <Field label="Extra game arguments" hint="Appended to Minecraft's own arguments.">
          <Textarea
            value={gameArgs}
            onChange={(e) => setGameArgs(e.target.value)}
            placeholder="--quickPlayMultiplayer play.example.net"
            rows={2}
            spellCheck={false}
            mono
          />
        </Field>
      </section>

      <Divider />

      <section className="space-y-3">
        <SectionHeader size="sm" title="Hooks" description="Commands run in the instance folder with the launcher's environment." />
        <Field label="Before launch">
          <Input value={preLaunchHook} onChange={(e) => setPreLaunchHook(e.target.value)} placeholder="e.g. a script that starts a voice client" mono spellCheck={false} />
        </Field>
        <Field label="After exit">
          <Input value={postExitHook} onChange={(e) => setPostExitHook(e.target.value)} placeholder="e.g. a backup script" mono spellCheck={false} />
        </Field>
      </section>

      <Divider />

      <section className="space-y-3">
        <SectionHeader size="sm" title="Shared config" />
        <Switch
          checked={sharedConfig}
          onCheckedChange={setSharedConfig}
          disabled={!globalSharedConfig}
          label="Sync shared config into this instance"
          description={
            globalSharedConfig
              ? 'Options, keybinds, servers and bundled mod configs stay identical across your instances.'
              : 'Shared config is turned off globally in Settings, so this instance keeps its own files.'
          }
        />
      </section>

      <Divider />

      <section className="space-y-3">
        <SectionHeader
          size="sm"
          title="Java"
          description="Leave empty to let Shard manage the right runtime for this Minecraft version."
        />
        <Field label="Custom Java executable">
          <div className="flex items-start gap-2">
            <Input
              value={javaPath}
              onChange={(e) => {
                setJavaPath(e.target.value)
                setValidation(null)
              }}
              placeholder="Managed runtime"
              mono
              spellCheck={false}
              className="flex-1"
            />
            <Button type="button" variant="secondary" leftIcon={<FolderOpen />} onClick={() => void browseJava()}>
              Browse
            </Button>
            <Button
              type="button"
              variant="secondary"
              leftIcon={<ShieldCheck />}
              onClick={runValidation}
              disabled={javaPath.trim() === ''}
              loading={validateJava.isPending}
            >
              Validate
            </Button>
          </div>
        </Field>
        <div className="flex min-h-6 items-center justify-between gap-3">
          <div className={cn('flex items-center gap-1.5 text-xs', validation ? (validation.valid ? 'text-success' : 'text-danger') : 'text-fg-subtle')} aria-live="polite">
            {validation ? (
              validation.valid ? (
                <>
                  <CircleCheck className="size-3.5" /> Java {validation.major} · {validation.version}
                </>
              ) : (
                <>
                  <CircleAlert className="size-3.5" /> {validation.error ?? 'Not a usable Java installation'}
                </>
              )
            ) : javaPath.trim() ? (
              'Not validated yet'
            ) : (
              'Using the managed runtime'
            )}
          </div>
          {javaPath.trim() !== '' && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              leftIcon={<RotateCcw />}
              onClick={() => {
                setJavaPath('')
                setValidation(null)
              }}
            >
              Use managed runtime
            </Button>
          )}
        </div>
        <div className="space-y-2 pt-1">
          <div className="text-[13px] font-medium text-fg">Managed Java runtimes</div>
          <JavaRuntimesList />
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
          Save settings
        </Button>
      </div>
    </form>
  )
}

/** Per-instance settings. Form state is created fresh on every open. */
export function InstanceSettingsDialog({ instance, open, onClose }: InstanceSettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`${instance.name} settings`} description={`Minecraft ${instance.minecraftVersion}`} size="lg">
      {open && <SettingsForm key={instance.id} instance={instance} onClose={onClose} />}
    </Dialog>
  )
}
