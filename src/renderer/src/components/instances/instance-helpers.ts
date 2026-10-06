import { clamp } from '@shared/format'

export const MEMORY_STEP_MB = 512
export const MIN_MEMORY_MB = 1024
/** Used while the system info query is still loading so the slider has sane bounds. */
export const FALLBACK_TOTAL_MEMORY_MB = 16384

/** Rounds down to the slider step, never below one step. */
export function roundToStep(mb: number, step = MEMORY_STEP_MB): number {
  return Math.max(step, Math.floor(mb / step) * step)
}

export function maxMemoryMb(totalMemoryMb: number): number {
  return Math.max(MIN_MEMORY_MB, roundToStep(totalMemoryMb))
}

/** Above this the UI warns: the OS and the launcher need the other half. */
export function memoryWarningMb(totalMemoryMb: number): number {
  return roundToStep(totalMemoryMb / 2)
}

/**
 * A quarter of system RAM, kept between 2 and 8 GB (Minecraft with a mod set rarely
 * benefits from more), and never above the warning threshold.
 */
export function recommendedMemoryMb(totalMemoryMb: number): number {
  const quarter = roundToStep(totalMemoryMb / 4)
  const preferred = clamp(quarter, 2048, 8192)
  return clamp(Math.min(preferred, memoryWarningMb(totalMemoryMb)), MIN_MEMORY_MB, maxMemoryMb(totalMemoryMb))
}

/**
 * Shell-style split: whitespace separates arguments and single or double quotes group.
 * Backslashes are literal (Windows paths survive) except `\"` and `\\` inside double
 * quotes, which is what {@link joinArgs} emits.
 */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let current = ''
  let hasToken = false
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      const next = input[i + 1]
      if (ch === quote) {
        quote = null
      } else if (ch === '\\' && quote === '"' && (next === '"' || next === '\\')) {
        current += next
        i++
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
    } else if (/\s/.test(ch)) {
      if (hasToken) {
        out.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += ch
      hasToken = true
    }
  }
  if (hasToken) out.push(current)
  return out
}

/** Inverse of {@link splitArgs}: quotes arguments that need it so the round trip is lossless. */
export function joinArgs(args: readonly string[]): string {
  return args
    .map((arg) => (arg === '' || /[\s"'\\]/.test(arg) ? `"${arg.replace(/(["\\])/g, '\\$1')}"` : arg))
    .join(' ')
}
