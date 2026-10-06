import { useState } from 'react'
import { type Cosmetic } from '@shared/types'
import { cn } from '@/lib/cn'
import { gradientFor } from '@/pages/cosmetics/cosmetics-utils'
import { TypeIcon } from './TypeIcon'

export interface CosmeticTileProps {
  cosmetic: Cosmetic
  /** 2D preview image (data URL). Falls back to a rarity gradient with the type icon. */
  previewUrl: string | null
  className?: string
  iconClassName?: string
}

export function CosmeticTile({
  cosmetic,
  previewUrl,
  className,
  iconClassName
}: CosmeticTileProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!previewUrl && failedSrc !== previewUrl
  return (
    <div
      className={cn('relative overflow-hidden bg-black/30', className)}
      style={showImage ? undefined : { background: gradientFor(cosmetic.rarity) }}
      aria-hidden
    >
      {showImage ? (
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedSrc(previewUrl)}
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <TypeIcon
            type={cosmetic.type}
            className={cn(
              'size-10 text-white/85 drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)]',
              iconClassName
            )}
          />
        </div>
      )}
    </div>
  )
}
