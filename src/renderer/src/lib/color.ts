import { DEFAULT_ACCENT } from '@shared/constants'

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return null
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex.trim())
}

/** Relative luminance (sRGB). */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

/**
 * Pushes the accent into CSS custom properties. Everything accent-coloured in the UI
 * (buttons, focus rings, glows, progress bars) reads these variables.
 */
export function applyAccent(hex: string): void {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_ACCENT)!
  const root = document.documentElement
  const fg = luminance(rgb) > 0.45 ? '#06070b' : '#ffffff'
  const hover = rgbToHex(mix(rgb, { r: 255, g: 255, b: 255 }, 0.12))
  const active = rgbToHex(mix(rgb, { r: 0, g: 0, b: 0 }, 0.12))
  root.style.setProperty('--accent', rgbToHex(rgb))
  root.style.setProperty('--accent-rgb', `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}`)
  root.style.setProperty('--accent-fg', fg)
  root.style.setProperty('--accent-hover', hover)
  root.style.setProperty('--accent-active', active)
}

export function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export const ACCENT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Crystal', hex: '#22D3EE' },
  { name: 'Amethyst', hex: '#A78BFA' },
  { name: 'Emerald', hex: '#34D399' },
  { name: 'Ember', hex: '#FB7185' },
  { name: 'Gold', hex: '#FBBF24' },
  { name: 'Ice', hex: '#93C5FD' },
  { name: 'Lime', hex: '#A3E635' },
  { name: 'Magenta', hex: '#E879F9' }
]
