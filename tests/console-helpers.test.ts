import { describe, expect, it, vi } from 'vitest'
import type { ConsoleLine } from '@shared/types'

// tsconfig.node.json is a composite project that does not list renderer files, so the
// modules are loaded at runtime and typed by hand instead of being imported statically.
type LevelFilter = 'all' | 'info' | 'warn' | 'error'
interface ConsoleHelpersModule {
  matchesLevel(level: ConsoleLine['level'], filter: LevelFilter): boolean
  filterConsole(lines: readonly ConsoleLine[], filter: LevelFilter, query: string, limit?: number): ConsoleLine[]
  consoleToText(lines: readonly ConsoleLine[]): string
}
interface SupportReportModule {
  buildSupportReport(input: {
    launcherVersion: string
    platform: string
    instanceName: string
    instanceType: string
    minecraftVersion: string
    shardBuild: string | null
    exitCode: number | null
    summary: string | null
    crashReportPath: string | null
    consoleLines: readonly ConsoleLine[]
  }): string
}
const { consoleToText, filterConsole, matchesLevel } = await vi.importActual<ConsoleHelpersModule>(
  '../src/renderer/src/pages/home/console-helpers'
)
const { buildSupportReport } = await vi.importActual<SupportReportModule>('../src/renderer/src/pages/home/support-report')

const line = (id: number, level: ConsoleLine['level'], text: string): ConsoleLine => ({
  id,
  ts: Date.UTC(2026, 0, 1, 12, 34, 56) + id,
  stream: level === 'error' ? 'stderr' : 'stdout',
  level,
  text
})

const LINES: ConsoleLine[] = [
  line(1, 'debug', 'dbg'),
  line(2, 'info', 'Loading Fabric'),
  line(3, 'warn', 'Deprecated option'),
  line(4, 'error', '\u001b[31mException in thread\u001b[0m'),
  line(5, 'fatal', 'Fatal')
]

describe('matchesLevel', () => {
  it('groups debug with info and fatal with error', () => {
    expect(matchesLevel('debug', 'info')).toBe(true)
    expect(matchesLevel('info', 'info')).toBe(true)
    expect(matchesLevel('warn', 'info')).toBe(false)
    expect(matchesLevel('warn', 'warn')).toBe(true)
    expect(matchesLevel('error', 'error')).toBe(true)
    expect(matchesLevel('fatal', 'error')).toBe(true)
    expect(matchesLevel('fatal', 'all')).toBe(true)
  })
})

describe('filterConsole', () => {
  it('returns every line for the default filters', () => {
    expect(filterConsole(LINES, 'all', '')).toEqual(LINES)
  })

  it('filters by level and by case-insensitive text with ANSI stripped', () => {
    expect(filterConsole(LINES, 'error', '').map((l) => l.id)).toEqual([4, 5])
    expect(filterConsole(LINES, 'all', 'exception IN').map((l) => l.id)).toEqual([4])
    expect(filterConsole(LINES, 'warn', 'fabric')).toEqual([])
  })

  it('keeps only the newest lines when over the limit', () => {
    expect(filterConsole(LINES, 'all', '', 2).map((l) => l.id)).toEqual([4, 5])
  })
})

describe('consoleToText', () => {
  it('strips ANSI and tags each line with its level', () => {
    const text = consoleToText([LINES[3]!])
    expect(text).toMatch(/^\[\d{2}:\d{2}:\d{2}\] \[ERROR\] Exception in thread$/)
  })
})

describe('buildSupportReport', () => {
  it('includes the header fields and the last lines, with UTC clocks', () => {
    const report = buildSupportReport({
      launcherVersion: '0.1.0',
      platform: 'win32',
      instanceName: 'Main',
      instanceType: 'shard',
      minecraftVersion: '1.21.4',
      shardBuild: null,
      exitCode: -1,
      summary: '  java.lang.OutOfMemoryError  ',
      crashReportPath: 'C:\\crash.txt',
      consoleLines: LINES
    })
    expect(report).toContain('Launcher: 0.1.0 (win32)')
    expect(report).toContain('Instance: Main (shard)')
    expect(report).toContain('Shard build: none (client pending)')
    expect(report).toContain('Exit code: -1')
    expect(report).toContain('Summary: java.lang.OutOfMemoryError')
    expect(report).toContain('--- Last 5 console lines ---')
    expect(report).toContain('[12:34:56] [ERROR] Exception in thread')
    expect(report.endsWith('[FATAL] Fatal')).toBe(true)
  })

  it('limits the tail to 60 lines and falls back for missing values', () => {
    const many = Array.from({ length: 100 }, (_, i) => line(i, 'info', `l${i}`))
    const report = buildSupportReport({
      launcherVersion: '0.1.0',
      platform: 'linux',
      instanceName: 'X',
      instanceType: 'vanilla',
      minecraftVersion: '1.21',
      shardBuild: '1.2.3',
      exitCode: null,
      summary: null,
      crashReportPath: null,
      consoleLines: many
    })
    expect(report).toContain('--- Last 60 console lines ---')
    expect(report).toContain('Exit code: unknown')
    expect(report).toContain('Summary: n/a')
    expect(report).toContain('Crash report: none')
    expect(report).not.toContain('] l39\n')
    expect(report).toContain('] l40')
  })
})
