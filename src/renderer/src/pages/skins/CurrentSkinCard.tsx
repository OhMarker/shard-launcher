import { Save } from 'lucide-react'
import { type AccountSummary, type MinecraftProfile } from '@shared/types'
import { RemotePlayerHead } from '@/components/player/PlayerHead'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { activeCape, activeSkin, toVariant, variantLabel } from './skins-utils'
import { type SkinMutations } from './useSkins'

export interface CurrentSkinCardProps {
  account: AccountSummary
  profile: MinecraftProfile | undefined
  loading: boolean
  saveCurrent: SkinMutations['saveCurrent']
}

export function CurrentSkinCard({ account, profile, loading, saveCurrent }: CurrentSkinCardProps) {
  const skin = activeSkin(profile)
  const cape = activeCape(profile)
  const skinUrl = skin?.url ?? account.skinUrl
  const variant = skin ? toVariant(skin.variant) : account.skinVariant

  return (
    <Card>
      <SectionHeader title="Current skin" description="What other players see right now." />
      <div className="mt-4 flex items-center gap-4">
        {loading && !profile ? (
          <>
            <Skeleton className="size-14 rounded-[12px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </>
        ) : (
          <>
            <RemotePlayerHead skinUrl={skinUrl} size={56} rounded="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-fg">
                {profile?.name ?? account.username}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge size="sm" tone={variant === 'slim' ? 'info' : 'neutral'}>
                  {variantLabel(variant)}
                </Badge>
                {cape && (
                  <Badge size="sm" tone="accent">
                    {cape.alias} cape
                  </Badge>
                )}
                {!skinUrl && (
                  <Badge size="sm" tone="outline">
                    Default skin
                  </Badge>
                )}
              </div>
            </div>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Save />}
          loading={saveCurrent.isPending}
          disabled={!skinUrl}
          onClick={() => saveCurrent.mutate()}
        >
          Save to library
        </Button>
      </div>
    </Card>
  )
}
