import { describe, expect, it, vi } from 'vitest'

// tsconfig.node.json is a composite project that does not list renderer files, so the
// module is loaded at runtime and typed by hand instead of being imported statically.
interface AnsiModule {
  parseAnsi(input: string): Array<{ text: string; color: string | null; bold: boolean }>
  stripAnsi(input: string): string
}
const { parseAnsi, stripAnsi } = await vi.importActual<AnsiModule>('../src/renderer/src/pages/home/ansi')

const ESC = '\u001b'

describe('parseAnsi', () => {
  it('returns one plain span for text without escapes', () => {
    expect(parseAnsi('hello world')).toEqual([{ text: 'hello world', color: null, bold: false }])
  })

  it('returns no spans for an empty string', () => {
    expect(parseAnsi('')).toEqual([])
  })

  it('applies the 8 base colours and resets', () => {
    expect(parseAnsi(`${ESC}[31mred${ESC}[0m plain`)).toEqual([
      { text: 'red', color: 'red', bold: false },
      { text: ' plain', color: null, bold: false }
    ])
  })

  it('applies bright colours and bold, and combines codes', () => {
    expect(parseAnsi(`${ESC}[1;92mok${ESC}[22m still green${ESC}[39m default`)).toEqual([
      { text: 'ok', color: 'bright-green', bold: true },
      { text: ' still green', color: 'bright-green', bold: false },
      { text: ' default', color: null, bold: false }
    ])
  })

  it('maps 256-colour indices 0-15 and ignores the rest', () => {
    expect(parseAnsi(`${ESC}[38;5;12mblue${ESC}[0m`)).toEqual([{ text: 'blue', color: 'bright-blue', bold: false }])
    expect(parseAnsi(`${ESC}[38;5;200mnope`)).toEqual([{ text: 'nope', color: null, bold: false }])
  })

  it('skips true-colour and background parameters without desynchronising', () => {
    expect(parseAnsi(`${ESC}[38;2;10;20;30;1mbold${ESC}[0m`)).toEqual([{ text: 'bold', color: null, bold: true }])
    expect(parseAnsi(`${ESC}[41;33mwarn`)).toEqual([{ text: 'warn', color: 'yellow', bold: false }])
  })

  it('strips non-SGR CSI sequences, OSC titles and two-byte escapes', () => {
    const input = `${ESC}[2K${ESC}[?25l${ESC}]0;title${'\u0007'}${ESC}7text${ESC}]8;;http://x${ESC}\\link`
    expect(parseAnsi(input)).toEqual([{ text: 'textlink', color: null, bold: false }])
  })

  it('merges adjacent spans with the same style', () => {
    expect(parseAnsi(`${ESC}[32ma${ESC}[32mb${ESC}[2Jc`)).toEqual([{ text: 'abc', color: 'green', bold: false }])
  })

  it('drops a truncated trailing sequence instead of throwing', () => {
    expect(parseAnsi(`ok${ESC}[31`)).toEqual([{ text: 'ok', color: null, bold: false }])
    expect(parseAnsi(`ok${ESC}`)).toEqual([{ text: 'ok', color: null, bold: false }])
  })
})

describe('stripAnsi', () => {
  it('returns the same string when there is nothing to strip', () => {
    expect(stripAnsi('[12:00:00] [main/INFO]: Loading')).toBe('[12:00:00] [main/INFO]: Loading')
  })

  it('removes every escape sequence', () => {
    expect(stripAnsi(`${ESC}[1;31m[ERROR]${ESC}[0m boom${ESC}[K`)).toBe('[ERROR] boom')
  })
})
