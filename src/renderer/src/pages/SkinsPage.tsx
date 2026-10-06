import { LogIn, Shirt, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { type AccountSummary, type BackView, type SkinVariant } from '@shared/types'
import { useAccounts, useActiveAccount, useProfile } from '@/hooks/useAccounts'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { useTexture } from '@/hooks/useTexture'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { SignInDialog } from '@/components/auth/SignInDialog'
import { type ViewerAnimation } from '@/components/player/SkinViewer'
import { Button } from '@/components/ui/Button'
import { confirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { AddSkinCard } from './skins/AddSkinCard'
import { CapesCard, type CapeHover } from './skins/CapesCard'
import { CurrentSkinCard } from './skins/CurrentSkinCard'
import { SkinLibrary } from './skins/SkinLibrary'
import { SkinPreviewCard } from './skins/SkinPreviewCard'
import { activeCape, activeSkin, sortSkins, toVariant, variantLabel } from './skins/skins-utils'
import { useDetectedVariant } from './skins/useDetectedVariant'
import { useSkinLibrary, useSkinMutations } from './skins/useSkins'

const DESCRIPTION = 'Change the skin and cape on your Minecraft profile.'
const APPLIED_FLASH_MS = 2000

function SkinsSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-[400px_minmax(0,1fr)] items-start gap-6" aria-hidden>
      <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />
      <div className="space-y-6">
        <Skeleton className="h-[300px] rounded-[var(--radius-lg)]" />
        <Skeleton className="h-[120px] rounded-[var(--radius-lg)]" />
      </div>
    </div>
  )
}

function SkinsContent({ account }: { account: AccountSummary }) {
  const profile = useProfile(account.id)
  const library = useSkinLibrary()
  const m = useSkinMutations(account.id)
  const viewerDefaults = useSettings((s) => s.settings.viewer)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A manual variant pick only applies to the selection it was made for.
  const [variantChoice, setVariantChoice] = useState<{
    forId: string | null
    variant: SkinVariant
  } | null>(null)
  const [capeHover, setCapeHover] = useState<CapeHover>(undefined)
  const [animation, setAnimation] = useState<ViewerAnimation>(viewerDefaults.animation)
  const [back, setBack] = useState<BackView>(viewerDefaults.back)
  const [autoRotate, setAutoRotate] = useState(viewerDefaults.autoRotate)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!applied) return
    const t = setTimeout(() => setApplied(false), APPLIED_FLASH_MS)
    return () => clearTimeout(t)
  }, [applied])

  const skins = useMemo(() => sortSkins(library.data ?? []), [library.data])
  const selectedSkin = selectedId ? (skins.find((s) => s.id === selectedId) ?? null) : null

  const active = activeSkin(profile.data)
  const activeUrl = active?.url ?? account.skinUrl
  const activeTexture = useTexture(activeUrl)
  const previewSkinUrl = selectedSkin?.dataUrl ?? activeTexture.data ?? null
  const detected = useDetectedVariant(previewSkinUrl)

  const profileVariant: SkinVariant = active ? toVariant(active.variant) : account.skinVariant
  const baseVariant = selectedSkin?.variant ?? profileVariant
  const variant =
    variantChoice && variantChoice.forId === selectedId ? variantChoice.variant : baseVariant

  const capeUrl =
    capeHover === undefined
      ? profile.data
        ? (activeCape(profile.data)?.url ?? null)
        : account.capeUrl
      : capeHover === null
        ? null
        : (profile.data?.capes.find((c) => c.id === capeHover)?.url ?? null)
  const capeTexture = useTexture(capeUrl)

  const canApply = selectedSkin !== null || (active !== null && variant !== profileVariant)
  const applyLabel = selectedSkin ? 'Apply skin' : `Switch to ${variantLabel(variant)}`

  const onApply = (): void => {
    const flash = (): void => setApplied(true)
    if (selectedSkin) m.apply.mutate({ id: selectedSkin.id, variant }, { onSuccess: flash })
    else if (active) m.applyUrl.mutate({ url: active.url, variant }, { onSuccess: flash })
  }

  const onReset = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Reset to the default skin?',
      message:
        'Your current skin is removed from your Minecraft profile. Skins in your library are kept.',
      confirmLabel: 'Reset',
      danger: true
    })
    if (ok) m.reset.mutate()
  }

  return (
    <PageBody wide>
      <PageHeader
        title="Skins"
        description={`Change the skin and cape on ${account.username}'s Minecraft profile.`}
      />
      {profile.isError && (
        <ErrorCard
          className="mt-6"
          error={profile.error}
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
          offlineHint="Your profile could not be loaded. Skins and capes need a connection to Mojang."
        />
      )}
      <div className="mt-6 grid grid-cols-[400px_minmax(0,1fr)] items-start gap-6">
        <SkinPreviewCard
          className="sticky top-0"
          skinUrl={previewSkinUrl}
          capeUrl={capeTexture.data ?? null}
          previewLabel={selectedSkin ? selectedSkin.name : 'Current skin'}
          variant={variant}
          detected={detected}
          onVariant={(v) => setVariantChoice({ forId: selectedId, variant: v })}
          animation={animation}
          onAnimation={setAnimation}
          back={back}
          onBack={setBack}
          autoRotate={autoRotate}
          onAutoRotate={setAutoRotate}
          applyLabel={applyLabel}
          canApply={canApply}
          applying={m.apply.isPending || m.applyUrl.isPending}
          applied={applied}
          onApply={onApply}
          onReset={() => void onReset()}
          resetting={m.reset.isPending}
        />
        <div className="space-y-6">
          <AddSkinCard m={m} />
          <CurrentSkinCard
            account={account}
            profile={profile.data}
            loading={profile.isLoading}
            saveCurrent={m.saveCurrent}
          />
          <CapesCard
            profile={profile.data}
            loading={profile.isLoading}
            setCape={m.setCape}
            onHover={setCapeHover}
          />
        </div>
      </div>
      <SkinLibrary
        className="mt-6"
        skins={skins}
        loading={library.isLoading}
        error={library.isError ? library.error : null}
        onRetry={() => void library.refetch()}
        selectedId={selectedId}
        onSelect={setSelectedId}
        currentSkinUrl={activeUrl}
        m={m}
      />
    </PageBody>
  )
}

export function SkinsPage() {
  const accounts = useAccounts()
  const account = useActiveAccount()
  const info = useSystemInfo()
  const navigate = useUi((s) => s.navigate)
  const [signInOpen, setSignInOpen] = useState(false)

  if (accounts.isLoading) {
    return (
      <PageBody wide>
        <PageHeader title="Skins" description={DESCRIPTION} />
        <SkinsSkeleton />
      </PageBody>
    )
  }

  if (!account) {
    const configured = info.data?.msaConfigured ?? true
    return (
      <PageBody wide>
        <PageHeader title="Skins" description={DESCRIPTION} />
        {configured ? (
          <EmptyState
            className="mt-16"
            icon={<Shirt />}
            title="Sign in to manage skins"
            description="Skins and capes are saved to your Minecraft profile, so Shard needs the Microsoft account that owns the game."
            action={
              <Button variant="primary" leftIcon={<LogIn />} onClick={() => setSignInOpen(true)}>
                Sign in with Microsoft
              </Button>
            }
          />
        ) : (
          <EmptyState
            className="mt-16"
            icon={<TriangleAlert />}
            title="Sign-in is not configured"
            description="Add a Microsoft client id in Settings before signing in. Skins need an authenticated Minecraft profile."
            action={
              <Button variant="primary" onClick={() => navigate('settings')}>
                Open Settings
              </Button>
            }
          />
        )}
        <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      </PageBody>
    )
  }

  // Keyed so switching accounts resets selection and viewer state.
  return <SkinsContent key={account.id} account={account} />
}
