import { Check, RotateCcw, Shirt, Undo2 } from 'lucide-react'
import { type BackView, type SkinVariant } from '@shared/types'
import { cn } from '@/lib/cn'
import { SkinViewer, type ViewerAnimation } from '@/components/player/SkinViewer'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Tooltip } from '@/components/ui/Tooltip'
import { variantLabel } from './skins-utils'

export interface SkinPreviewCardProps {
  skinUrl: string | null
  capeUrl: string | null
  /** What is on the model: a library skin's name or "Current skin". */
  previewLabel: string
  variant: SkinVariant
  detected: SkinVariant | null
  onVariant: (variant: SkinVariant) => void
  animation: ViewerAnimation
  onAnimation: (animation: ViewerAnimation) => void
  back: BackView
  onBack: (back: BackView) => void
  autoRotate: boolean
  onAutoRotate: (value: boolean) => void
  applyLabel: string
  canApply: boolean
  applying: boolean
  /** Briefly true after a successful apply. */
  applied: boolean
  onApply: () => void
  onReset: () => void
  resetting: boolean
  className?: string
}

const ANIMATIONS: ReadonlyArray<{ value: ViewerAnimation; label: string }> = [
  { value: 'idle', label: 'Idle' },
  { value: 'walk', label: 'Walk' },
  { value: 'run', label: 'Run' },
  { value: 'none', label: 'Still' }
]

const BACKS: ReadonlyArray<{ value: BackView; label: string }> = [
  { value: 'cape', label: 'Cape' },
  { value: 'elytra', label: 'Elytra' }
]

const VARIANTS: ReadonlyArray<{ value: SkinVariant; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'slim', label: 'Slim' }
]

export function SkinPreviewCard({
  skinUrl,
  capeUrl,
  previewLabel,
  variant,
  detected,
  onVariant,
  animation,
  onAnimation,
  back,
  onBack,
  autoRotate,
  onAutoRotate,
  applyLabel,
  canApply,
  applying,
  applied,
  onApply,
  onReset,
  resetting,
  className
}: SkinPreviewCardProps) {
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="relative h-[440px] bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-rgb)/0.14),transparent_65%)]">
        <SkinViewer
          skinUrl={skinUrl}
          capeUrl={capeUrl}
          model={variant}
          back={back}
          animation={animation}
          autoRotate={autoRotate}
          zoom={0.85}
        />
        <div className="pointer-events-none absolute left-3 top-3">
          <Badge tone="neutral" icon={<Shirt />} className="glass-strong">
            {previewLabel}
          </Badge>
        </div>
        <div className="absolute right-3 top-3">
          <IconButton
            label={autoRotate ? 'Stop rotating' : 'Rotate automatically'}
            size="sm"
            variant="secondary"
            active={autoRotate}
            aria-pressed={autoRotate}
            onClick={() => onAutoRotate(!autoRotate)}
          >
            <RotateCcw />
          </IconButton>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <Tabs<ViewerAnimation>
            size="sm"
            value={animation}
            onChange={onAnimation}
            items={ANIMATIONS}
            className="glass-strong"
          />
          <Tabs<BackView>
            size="sm"
            value={back}
            onChange={onBack}
            items={BACKS}
            className="glass-strong"
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-fg">Model</div>
            <div className="truncate text-xs text-fg-subtle">
              {detected ? `Auto-detected: ${variantLabel(detected)}` : 'Arm width for this skin'}
            </div>
          </div>
          <Tabs<SkinVariant> size="sm" value={variant} onChange={onVariant} items={VARIANTS} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={applied ? 'secondary' : 'primary'}
            fullWidth
            leftIcon={applied ? <Check /> : undefined}
            loading={applying}
            disabled={!applied && !canApply}
            onClick={onApply}
            aria-live="polite"
            className={cn(
              applied && 'border-success/40 bg-success/15 text-success hover:bg-success/20'
            )}
          >
            {applied ? 'Applied' : applyLabel}
          </Button>
          <Tooltip content="Removes the skin from your Minecraft profile. Library skins are kept.">
            <Button variant="ghost" leftIcon={<Undo2 />} loading={resetting} onClick={onReset}>
              Reset to default
            </Button>
          </Tooltip>
        </div>
      </div>
    </Card>
  )
}
