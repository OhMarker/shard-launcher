import { useState } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/pages/mods/mods-utils'

export interface ModIconProps {
  src: string | null | undefined
  name: string
  size?: number
  className?: string
}

/** Square mod icon with an initials tile when there is no image or it fails to load. */
export function ModIcon({ src, name, size = 40, className }: ModIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!src && failedSrc !== src
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-white/6',
        className
      )}
      aria-hidden
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          className="font-semibold tracking-wide text-fg-muted"
          style={{ fontSize: Math.max(10, Math.round(size * 0.32)) }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  )
}
