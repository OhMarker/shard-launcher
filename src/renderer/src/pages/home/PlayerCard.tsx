import { AnimatePresence, motion } from 'framer-motion'
import { Feather, Footprints, LogIn, PersonStanding, RotateCcw, Shirt, Zap } from 'lucide-react'
import { type BackView, type ModelAnimation } from '@shared/types'
import { useActiveAccount, useProfile } from '@/hooks/useAccounts'
import { useTexture } from '@/hooks/useTexture'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { SkinViewer } from '@/components/player/SkinViewer'
import { useSettingsUpdate } from '@/pages/settings/useSettingsUpdate'
import { useCosmeticsView } from '@/pages/cosmetics/useCosmetics'

const ANIMATIONS: ReadonlyArray<{ value: ModelAnimation; label: string; icon: JSX.Element }> = [
  { value: 'idle', label: 'Idle', icon: <PersonStanding /> },
  { value: 'walk', label: 'Walk', icon: <Footprints /> },
  { value: 'run', label: 'Run', icon: <Zap /> }
]

const BACKS: ReadonlyArray<{ value: BackView; label: string; icon: JSX.Element }> = [
  { value: 'cape', label: 'Cape', icon: <Shirt /> },
  { value: 'elytra', label: 'Elytra', icon: <Feather /> }
]

/** Large 3D player card on Home. Viewer preferences persist to settings. */
export function PlayerCard({ onSignIn, className }: { onSignIn: () => void; className?: string }) {
  const account = useActiveAccount()
  const { data: profile } = useProfile(account?.id ?? null)
  const viewer = useSettings((s) => s.settings.viewer)
  const update = useSettingsUpdate()

  const activeSkin = profile?.skins.find((s) => s.state === 'ACTIVE') ?? null
  const activeCape = profile?.capes.find((c) => c.state === 'ACTIVE') ?? null
  const skinUrl = activeSkin?.url ?? account?.skinUrl ?? null
  const capeUrl = activeCape?.url ?? account?.capeUrl ?? null
  const model = activeSkin ? (activeSkin.variant === 'SLIM' ? 'slim' : 'classic') : (account?.skinVariant ?? 'auto')

  const skin = useTexture(skinUrl)
  // Shard shield skin and bandana, as equipped on the Cosmetics page.
  const { data: cosmetics } = useCosmeticsView()
  const worn = (slot: 'shield' | 'bandana'): string | null => {
    const id = account ? (cosmetics?.equipped.equipped[slot] ?? null) : null
    return id ? (cosmetics?.textures[id] ?? null) : null
  }
  const cape = useTexture(capeUrl)
  const loadingSkin = skinUrl !== null && skin.isLoading

  const setViewer = (patch: Partial<typeof viewer>): void => {
    void update({ viewer: { ...viewer, ...patch } })
  }

  return (
    <Card padding="none" className={cn('relative flex min-h-[460px] flex-col overflow-hidden', className)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 65%, rgb(var(--accent-rgb) / 0.18), transparent 70%), radial-gradient(40% 30% at 50% 100%, rgb(var(--accent-rgb) / 0.25), transparent 70%)'
        }}
        aria-hidden
      />
      <div className="relative min-h-[340px] flex-1" aria-label={account ? `${account.username}'s player model` : 'Player model'} role="img">
        <SkinViewer
          skinUrl={skin.data ?? null}
          capeUrl={cape.data ?? null}
          shieldUrl={worn('shield')}
          bandanaUrl={worn('bandana')}
          model={model}
          back={viewer.back}
          animation={viewer.animation}
          autoRotate={viewer.autoRotate}
          zoom={0.85}
        />
        <AnimatePresence>
          {loadingSkin && (
            <motion.div
              key="skin-skeleton"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              className="pointer-events-none absolute inset-x-[30%] inset-y-[12%] skeleton rounded-[24px]"
              aria-hidden
            />
          )}
        </AnimatePresence>
        {!account && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full border border-line bg-[#0b0f18]/70 px-3 py-1 text-xs text-fg-muted backdrop-blur">
              Sign in to see your player
            </span>
          </div>
        )}
      </div>

      <div className="relative space-y-2.5 border-t border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{account ? account.username : 'Not signed in'}</div>
            <div className="truncate text-[11.5px] text-fg-muted">
              {account ? (activeCape ? `Wearing the ${activeCape.alias} cape` : 'No cape equipped') : 'Microsoft account required to play'}
            </div>
          </div>
          {!account && (
            <Button size="xs" variant="outline" leftIcon={<LogIn />} onClick={onSignIn}>
              Sign in
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs<ModelAnimation>
            size="sm"
            value={viewer.animation}
            onChange={(animation) => setViewer({ animation })}
            items={ANIMATIONS.map((a) => ({ value: a.value, label: a.label, icon: a.icon }))}
          />
          <Tabs<BackView>
            size="sm"
            value={viewer.back}
            onChange={(back) => setViewer({ back })}
            items={BACKS.map((b) => ({ value: b.value, label: b.label, icon: b.icon }))}
          />
          <IconButton
            label={viewer.autoRotate ? 'Stop auto-rotate' : 'Auto-rotate'}
            size="sm"
            active={viewer.autoRotate}
            aria-pressed={viewer.autoRotate}
            onClick={() => setViewer({ autoRotate: !viewer.autoRotate })}
            className="ml-auto"
          >
            <RotateCcw className={cn(viewer.autoRotate && 'animate-[spin_6s_linear_infinite_reverse]')} />
          </IconButton>
        </div>
      </div>
    </Card>
  )
}
