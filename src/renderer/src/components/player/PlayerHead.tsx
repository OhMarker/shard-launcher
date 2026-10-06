import { useEffect, useRef } from 'react'
import { UserRound } from 'lucide-react'
import { useTexture } from '@/hooks/useTexture'
import { cn } from '@/lib/cn'

export interface PlayerHeadProps {
  /** Skin PNG as a data URL or remote URL already fetched. */
  skinDataUrl: string | null | undefined
  size?: number
  className?: string
  rounded?: 'sm' | 'md' | 'lg'
}

/**
 * Draws the face (8x8 at 8,8) plus the hat overlay (8x8 at 40,8) from a skin texture onto a
 * crisp, pixelated canvas. Works for both 64x64 and legacy 64x32 skins.
 */
export function PlayerHead({ skinDataUrl, size = 32, className, rounded = 'md' }: PlayerHeadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !skinDataUrl) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Face, then hat layer scaled slightly larger for the classic "layered" look.
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height)
      const inset = canvas.width * 0.06
      ctx.drawImage(img, 40, 8, 8, 8, -inset, -inset, canvas.width + inset * 2, canvas.height + inset * 2)
    }
    img.src = skinDataUrl
  }, [skinDataUrl, size])

  const radius = { sm: 'rounded-[6px]', md: 'rounded-[8px]', lg: 'rounded-[12px]' }[rounded]

  if (!skinDataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={cn('flex items-center justify-center border border-line bg-white/6 text-fg-subtle', radius, className)}
      >
        <UserRound style={{ width: size * 0.55, height: size * 0.55 }} />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={cn('shrink-0 bg-white/5', radius, className)}
      aria-hidden
    />
  )
}

/** Convenience: head for a remote skin URL (fetches through main). */
export function RemotePlayerHead({ skinUrl, ...rest }: Omit<PlayerHeadProps, 'skinDataUrl'> & { skinUrl: string | null | undefined }) {
  const { data } = useTexture(skinUrl)
  return <PlayerHead skinDataUrl={data ?? null} {...rest} />
}
