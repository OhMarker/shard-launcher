/**
 * Minimal ANSI SGR parser for the console drawer. Supports the 16 standard colours
 * (30-37, 90-97 and the 256-colour indices 0-15) plus bold; every other escape
 * sequence (cursor movement, erase, OSC titles, true colour...) is stripped.
 */

export type AnsiColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bright-black'
  | 'bright-red'
  | 'bright-green'
  | 'bright-yellow'
  | 'bright-blue'
  | 'bright-magenta'
  | 'bright-cyan'
  | 'bright-white'

export interface AnsiSpan {
  text: string
  color: AnsiColor | null
  bold: boolean
}

interface SgrState {
  color: AnsiColor | null
  bold: boolean
}

const ESC = '\u001b'
const BEL = '\u0007'

const BASE_COLORS: readonly AnsiColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const BRIGHT_COLORS: readonly AnsiColor[] = [
  'bright-black',
  'bright-red',
  'bright-green',
  'bright-yellow',
  'bright-blue',
  'bright-magenta',
  'bright-cyan',
  'bright-white'
]

/** CSI sequences end with a byte in the 0x40-0x7E range. */
function isFinalByte(code: number): boolean {
  return code >= 0x40 && code <= 0x7e
}

function colorFromIndex(index: number): AnsiColor | null {
  if (index >= 0 && index < 8) return BASE_COLORS[index] ?? null
  if (index >= 8 && index < 16) return BRIGHT_COLORS[index - 8] ?? null
  return null
}

function applySgr(params: string, state: SgrState): SgrState {
  const codes = params.split(';').map((p) => (p === '' ? 0 : Number(p)))
  let { color, bold } = state
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!
    if (!Number.isFinite(code)) continue
    if (code === 0) {
      color = null
      bold = false
    } else if (code === 1) {
      bold = true
    } else if (code === 22) {
      bold = false
    } else if (code >= 30 && code <= 37) {
      color = BASE_COLORS[code - 30] ?? color
    } else if (code === 39) {
      color = null
    } else if (code >= 90 && code <= 97) {
      color = BRIGHT_COLORS[code - 90] ?? color
    } else if (code === 38 || code === 48) {
      const mode = codes[i + 1]
      if (mode === 5) {
        const index = codes[i + 2]
        if (code === 38 && index !== undefined) color = colorFromIndex(index) ?? color
        i += 2
      } else if (mode === 2) {
        // True colour is outside the 16-colour palette: skip r, g, b.
        i += 4
      }
    }
  }
  return { color, bold }
}

function pushSpan(spans: AnsiSpan[], span: AnsiSpan): void {
  if (span.text === '') return
  const last = spans[spans.length - 1]
  if (last && last.color === span.color && last.bold === span.bold) {
    last.text += span.text
    return
  }
  spans.push(span)
}

/** Splits a console line into styled spans. Never throws; unknown sequences vanish. */
export function parseAnsi(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = []
  let state: SgrState = { color: null, bold: false }
  let buffer = ''
  const flush = (): void => {
    pushSpan(spans, { text: buffer, color: state.color, bold: state.bold })
    buffer = ''
  }

  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (ch !== ESC) {
      buffer += ch
      i++
      continue
    }
    const next = input[i + 1]
    if (next === '[') {
      let j = i + 2
      while (j < input.length && !isFinalByte(input.charCodeAt(j))) j++
      if (j >= input.length) break // truncated sequence: drop the tail
      if (input[j] === 'm') {
        flush()
        state = applySgr(input.slice(i + 2, j), state)
      }
      i = j + 1
    } else if (next === ']') {
      let j = i + 2
      while (j < input.length && input[j] !== BEL && !(input[j] === ESC && input[j + 1] === '\\')) j++
      if (j >= input.length) break
      i = input[j] === BEL ? j + 1 : j + 2
    } else if (next !== undefined) {
      i += 2 // two-byte escape (e.g. ESC 7, ESC 8)
    } else {
      i++
    }
  }
  flush()
  return spans
}

/** Plain text with every escape sequence removed. */
export function stripAnsi(input: string): string {
  if (!input.includes(ESC)) return input
  return parseAnsi(input)
    .map((s) => s.text)
    .join('')
}
