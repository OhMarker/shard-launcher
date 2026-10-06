import { useEffect, useRef } from 'react'
import { IdleAnimation, RunningAnimation, SkinViewer as Skinview3d, WalkingAnimation, type PlayerAnimation } from 'skinview3d'
import { cn } from '@/lib/cn'

export type ViewerAnimation = 'idle' | 'walk' | 'run' | 'none'

export interface SkinViewerProps {
  /** Skin PNG: data URL or https URL. null renders the default Steve/Alex. */
  skinUrl: string | null | undefined
  /** Cape/elytra texture (64x32 cape layout). null removes the cape. */
  capeUrl?: string | null
  model?: 'classic' | 'slim' | 'auto'
  back?: 'cape' | 'elytra'
  animation?: ViewerAnimation
  autoRotate?: boolean
  autoRotateSpeed?: number
  /** Allow drag to orbit and wheel to zoom. */
  interactive?: boolean
  zoom?: number
  fov?: number
  className?: string
  onReady?: () => void
}

function makeAnimation(kind: ViewerAnimation): PlayerAnimation | null {
  switch (kind) {
    case 'idle':
      return new IdleAnimation()
    case 'walk':
      return new WalkingAnimation()
    case 'run':
      return new RunningAnimation()
    default:
      return null
  }
}

/**
 * skinview3d wrapper. Renders at device pixel ratio, resizes with its container, pauses when
 * the window is hidden, and swaps textures in place without recreating the renderer.
 */
export function SkinViewer({
  skinUrl,
  capeUrl = null,
  model = 'auto',
  back = 'cape',
  animation = 'idle',
  autoRotate = true,
  autoRotateSpeed = 0.6,
  interactive = true,
  zoom = 0.9,
  fov = 50,
  className,
  onReady
}: SkinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Skinview3d | null>(null)
  const readyRef = useRef(onReady)
  useEffect(() => {
    readyRef.current = onReady
  }, [onReady])

  // Create once.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const viewer = new Skinview3d({
      canvas,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      pixelRatio: 'match-device',
      fov,
      zoom,
      enableControls: true
    })
    viewer.background = null
    viewer.controls.enablePan = false
    viewer.controls.enableDamping = true
    viewer.controls.dampingFactor = 0.08
    viewer.controls.minDistance = 10
    viewer.controls.maxDistance = 80
    viewer.globalLight.intensity = 2.6
    viewer.cameraLight.intensity = 1.0
    viewer.camera.position.set(14, 6, 34)
    viewer.controls.target.set(0, 0, 0)
    viewerRef.current = viewer

    const ro = new ResizeObserver(() => {
      if (viewer.disposed) return
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      if (w !== viewer.width || h !== viewer.height) viewer.setSize(w, h)
    })
    ro.observe(container)

    const onVisibility = (): void => {
      viewer.renderPaused = document.visibilityState !== 'visible'
    }
    document.addEventListener('visibilitychange', onVisibility)
    readyRef.current?.()

    return () => {
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      viewer.dispose()
      viewerRef.current = null
    }
    // Options that require recreation are intentionally excluded; they are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.autoRotate = autoRotate
    viewer.autoRotateSpeed = autoRotateSpeed
  }, [autoRotate, autoRotateSpeed])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.controls.enableRotate = interactive
    viewer.controls.enableZoom = interactive
  }, [interactive])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.zoom = zoom
    viewer.fov = fov
  }, [zoom, fov])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.animation = makeAnimation(animation)
  }, [animation])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let cancelled = false
    const skinModel = model === 'auto' ? 'auto-detect' : model === 'slim' ? 'slim' : 'default'
    if (!skinUrl) {
      // skinview3d has no built-in default; draw a neutral placeholder skin.
      viewer.loadSkin(placeholderSkin(), { model: 'default' })
      return
    }
    void viewer
      .loadSkin(skinUrl, { model: skinModel })
      .catch(() => {
        if (!cancelled) viewer.loadSkin(placeholderSkin(), { model: 'default' })
      })
    return () => {
      cancelled = true
    }
  }, [skinUrl, model])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (!capeUrl) {
      viewer.resetCape()
      return
    }
    let cancelled = false
    void viewer.loadCape(capeUrl, { backEquipment: back }).catch(() => {
      if (!cancelled) viewer.resetCape()
    })
    return () => {
      cancelled = true
    }
  }, [capeUrl, back])

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', className)}>
      <canvas ref={canvasRef} className="block h-full w-full outline-none" tabIndex={-1} />
    </div>
  )
}

let placeholder: HTMLCanvasElement | null = null

/** A flat slate-coloured 64x64 skin used before a real one loads. */
function placeholderSkin(): HTMLCanvasElement {
  if (placeholder) return placeholder
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3b4556'
  ctx.fillRect(0, 0, 64, 32)
  ctx.fillStyle = '#2b3342'
  ctx.fillRect(0, 16, 64, 16)
  ctx.fillStyle = '#4b5668'
  ctx.fillRect(16, 16, 24, 16) // torso
  ctx.fillStyle = '#5b6779'
  ctx.fillRect(8, 8, 8, 8) // face
  ctx.fillStyle = '#22d3ee'
  ctx.fillRect(10, 12, 1, 1)
  ctx.fillRect(13, 12, 1, 1) // eyes
  ctx.fillStyle = '#2b3342'
  ctx.fillRect(0, 32, 64, 32)
  placeholder = c
  return c
}
