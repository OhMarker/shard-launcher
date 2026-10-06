import { Check, EyeOff, Flag } from 'lucide-react'
import { type MinecraftProfile, type ProfileCape } from '@shared/types'
import { useTexture } from '@/hooks/useTexture'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { CapePreview } from '@/components/skins/CapePreview'
import { type SkinMutations } from './useSkins'

/** `undefined` = nothing hovered (show the active cape), `null` = previewing "no cape". */
export type CapeHover = string | null | undefined

export interface CapesCardProps {
  profile: MinecraftProfile | undefined
  loading: boolean
  setCape: SkinMutations['setCape']
  onHover: (capeId: CapeHover) => void
}

function CapeRow({
  cape,
  pending,
  disabled,
  onUse,
  onHover
}: {
  cape: ProfileCape
  pending: boolean
  disabled: boolean
  onUse: () => void
  onHover: (capeId: CapeHover) => void
}) {
  const texture = useTexture(cape.url)
  const active = cape.state === 'ACTIVE'
  return (
    <li
      onMouseEnter={() => onHover(cape.id)}
      onMouseLeave={() => onHover(undefined)}
      className={cn(
        'flex items-center gap-3 rounded-[12px] border px-3 py-2.5 transition-colors',
        active ? 'border-accent/40 bg-accent/8' : 'border-line bg-white/3 hover:bg-white/6'
      )}
    >
      <CapePreview textureDataUrl={texture.data} scale={3} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{cape.alias}</span>
          {active && (
            <Badge size="sm" tone="accent" icon={<Check />}>
              Active
            </Badge>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant={active ? 'ghost' : 'outline'}
        disabled={active || disabled}
        loading={pending}
        onClick={onUse}
        onFocus={() => onHover(cape.id)}
        onBlur={() => onHover(undefined)}
      >
        {active ? 'In use' : 'Use'}
      </Button>
    </li>
  )
}

export function CapesCard({ profile, loading, setCape, onHover }: CapesCardProps) {
  const capes = profile?.capes ?? []
  const hasActive = capes.some((c) => c.state === 'ACTIVE')
  const pendingId = setCape.isPending ? setCape.variables : undefined

  return (
    <Card>
      <SectionHeader
        title="Capes"
        description="Capes from Mojang events and purchases. The active one shows on the model."
        action={
          hasActive && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<EyeOff />}
              loading={pendingId === null}
              disabled={setCape.isPending}
              onClick={() => setCape.mutate(null)}
              onMouseEnter={() => onHover(null)}
              onMouseLeave={() => onHover(undefined)}
              onFocus={() => onHover(null)}
              onBlur={() => onHover(undefined)}
            >
              Hide cape
            </Button>
          )
        }
      />
      <div className="mt-4">
        {loading && !profile ? (
          <ul className="space-y-2" aria-hidden>
            {Array.from({ length: 2 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5"
              >
                <Skeleton className="h-12 w-[30px] rounded-[4px]" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="ml-auto h-8 w-14" />
              </li>
            ))}
          </ul>
        ) : capes.length === 0 ? (
          <EmptyState
            compact
            icon={<Flag />}
            title="No capes on this account"
            description="Capes come from Mojang events and Minecraft purchases; they cannot be uploaded."
          />
        ) : (
          <ul className="space-y-2">
            {capes.map((cape) => (
              <CapeRow
                key={cape.id}
                cape={cape}
                pending={pendingId === cape.id}
                disabled={setCape.isPending}
                onUse={() => setCape.mutate(cape.id)}
                onHover={onHover}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
