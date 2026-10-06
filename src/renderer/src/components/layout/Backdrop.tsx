import { useEffect, useRef } from 'react'
import { useSettings } from '@/stores/settings'
import { hexToRgb } from '@/lib/color'

interface Facet {
  x: number
  y: number
  r: number
  rot: number
  vx: number
  vy: number
  vr: number
  alpha: number
  sides: number
}

/**
 * Slowly drifting translucent crystal facets in the accent colour, drawn on a canvas behind
 * everything. Pauses when the window is hidden and respects reduced-motion.
 */
export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accent = useSettings((s) => s.settings.accent)
  const theme = useSettings((s) => s.settings.theme)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rgb = hexToRgb(accent) ?? { r: 34, g: 211, b: 238 }
    let facets: Facet[] = []
    let raf = 0
    let running = true
    let w = 0
    let h = 0

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (facets.length === 0) {
        const count = Math.max(10, Math.floor((w * h) / 90_000))
        facets = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 40 + Math.random() * 160,
          rot: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.08,
          vy: (Math.random() - 0.5) * 0.06,
          vr: (Math.random() - 0.5) * 0.0008,
          alpha: 0.025 + Math.random() * 0.05,
          sides: 3 + Math.floor(Math.random() * 3)
        }))
      }
    }

    const drawFacet = (f: Facet): void => {
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.rot)
      const grad = ctx.createLinearGradient(-f.r, -f.r, f.r, f.r)
      grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${f.alpha * 1.6})`)
      grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`)
      ctx.beginPath()
      for (let i = 0; i < f.sides; i++) {
        const a = (i / f.sides) * Math.PI * 2
        const rr = f.r * (i % 2 === 0 ? 1 : 0.62)
        const px = Math.cos(a) * rr
        const py = Math.sin(a) * rr * 1.6
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${f.alpha * 1.2})`
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    const frame = (): void => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      // Soft radial glow top-right, in the accent colour.
      const glow = ctx.createRadialGradient(w * 0.82, h * 0.1, 0, w * 0.82, h * 0.1, Math.max(w, h) * 0.6)
      glow.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${theme === 'light' ? 0.12 : 0.1})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)
      const glow2 = ctx.createRadialGradient(w * 0.1, h * 0.95, 0, w * 0.1, h * 0.95, Math.max(w, h) * 0.5)
      glow2.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`)
      glow2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow2
      ctx.fillRect(0, 0, w, h)

      for (const f of facets) {
        if (!reduced) {
          f.x += f.vx
          f.y += f.vy
          f.rot += f.vr
          if (f.x < -f.r) f.x = w + f.r
          if (f.x > w + f.r) f.x = -f.r
          if (f.y < -f.r * 1.6) f.y = h + f.r * 1.6
          if (f.y > h + f.r * 1.6) f.y = -f.r * 1.6
        }
        drawFacet(f)
      }
      if (!reduced) raf = requestAnimationFrame(frame)
    }

    const onVisibility = (): void => {
      running = document.visibilityState === 'visible'
      if (running) {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(frame)
      } else cancelAnimationFrame(raf)
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) frame()
    })
    ro.observe(canvas)
    resize()
    raf = requestAnimationFrame(frame)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [accent, theme])

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === 'light'
              ? 'radial-gradient(1200px 600px at 20% -10%, rgb(var(--accent-rgb) / 0.12), transparent 60%), var(--bg)'
              : 'radial-gradient(1200px 600px at 20% -10%, rgb(var(--accent-rgb) / 0.08), transparent 60%), linear-gradient(180deg, #0a0e17 0%, #07090f 60%, #05070b 100%)'
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
        }}
      />
    </div>
  )
}
