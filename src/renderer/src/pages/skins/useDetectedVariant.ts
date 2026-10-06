import { useEffect, useState } from 'react'
import { type SkinVariant } from '@shared/types'
import { detectSlim } from './skins-utils'

/**
 * Loads a skin PNG (data URL) off-screen and infers classic vs slim arms from its pixels.
 * Returns null while loading, for unknown dimensions, or when the image cannot be read.
 */
export function useDetectedVariant(dataUrl: string | null): SkinVariant | null {
  const [result, setResult] = useState<{ url: string; variant: SkinVariant | null } | null>(null)

  useEffect(() => {
    if (!dataUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      let variant: SkinVariant | null = null
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const slim = detectSlim(data, canvas.width, canvas.height)
          variant = slim === null ? null : slim ? 'slim' : 'classic'
        }
      } catch {
        // A cross-origin image taints the canvas; the caller only passes data URLs, but stay safe.
        variant = null
      }
      setResult({ url: dataUrl, variant })
    }
    img.onerror = () => {
      if (!cancelled) setResult({ url: dataUrl, variant: null })
    }
    img.src = dataUrl
    return () => {
      cancelled = true
    }
  }, [dataUrl])

  return result && result.url === dataUrl ? result.variant : null
}
