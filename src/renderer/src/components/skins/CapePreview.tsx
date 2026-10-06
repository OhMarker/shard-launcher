import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { CAPE_FRONT } from '@/pages/skins/skins-utils'

export interface CapePreviewProps {
  /** Cape texture as a data URL (64x32 layout, or an integer multiple for HD capes). */
  textureDataUrl: string | null | undefined
  /** CSS pixels per texture pixel. */
  scale?: number
  className?: string
}

/** Draws the front face of a cape (the 10x16 block at 1,1) crisp and pixelated. */
export function CapePreview({ textureDataUrl, scale = 3, className }: CapePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = CAPE_FRONT.w * scale
  const height = CAPE_FRONT.h * scale

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !textureDataUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const f = Math.max(1, img.naturalWidth / 64)
      ctx.drawImage(
        img,
        CAPE_FRONT.x * f,
        CAPE_FRONT.y * f,
        CAPE_FRONT.w * f,
        CAPE_FRONT.h * f,
        0,
        0,
        canvas.width,
        canvas.height
      )
    }
    img.src = textureDataUrl
    return () => {
      cancelled = true
    }
  }, [textureDataUrl, width, height])

  if (!textureDataUrl) {
    return (
      <div
        style={{ width, height }}
        className={cn('skeleton shrink-0 rounded-[4px]', className)}
        aria-hidden
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, imageRendering: 'pixelated' }}
      className={cn('shrink-0 rounded-[4px] bg-white/5', className)}
      aria-hidden
    />
  )
}
