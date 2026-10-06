import type { ConsoleLevel, ConsoleLine } from '@shared/types'
import { stripAnsi } from './ansi'

export type LevelFilter = 'all' | 'info' | 'warn' | 'error'

export const LEVEL_FILTERS: ReadonlyArray<{ value: LevelFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' }
]

/** How many lines the drawer renders at most; older ones stay in the store. */
export const CONSOLE_RENDER_LIMIT = 1500

export function matchesLevel(level: ConsoleLevel, filter: LevelFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'info':
      return level === 'debug' || level === 'info'
    case 'warn':
      return level === 'warn'
    case 'error':
      return level === 'error' || level === 'fatal'
  }
}

/** Applies the level and text filters, then keeps only the newest `limit` lines. */
export function filterConsole(
  lines: readonly ConsoleLine[],
  filter: LevelFilter,
  query: string,
  limit = CONSOLE_RENDER_LIMIT
): ConsoleLine[] {
  const needle = query.trim().toLowerCase()
  const matched =
    filter === 'all' && needle === ''
      ? lines
      : lines.filter(
          (line) => matchesLevel(line.level, filter) && (needle === '' || stripAnsi(line.text).toLowerCase().includes(needle))
        )
  return matched.length > limit ? matched.slice(-limit) : [...matched]
}

/** `HH:MM:SS` in the local time zone for the gutter. */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Plain-text rendering used by "Copy all". */
export function consoleToText(lines: readonly ConsoleLine[]): string {
  return lines.map((l) => `[${formatClock(l.ts)}] [${l.level.toUpperCase()}] ${stripAnsi(l.text)}`).join('\n')
}
