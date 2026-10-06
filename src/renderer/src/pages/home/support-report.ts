import type { ConsoleLine } from '@shared/types'
import { stripAnsi } from './ansi'

export const SUPPORT_CONSOLE_LINES = 60

export interface SupportReportInput {
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
}

function utcClock(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19)
}

/** The block "Copy for support" puts on the clipboard. Deterministic (UTC timestamps). */
export function buildSupportReport(input: SupportReportInput): string {
  const tail = input.consoleLines.slice(-SUPPORT_CONSOLE_LINES)
  const header = [
    'Shard Launcher crash report',
    `Launcher: ${input.launcherVersion} (${input.platform})`,
    `Instance: ${input.instanceName} (${input.instanceType})`,
    `Minecraft: ${input.minecraftVersion}`,
    `Shard build: ${input.shardBuild ?? 'none (client pending)'}`,
    `Exit code: ${input.exitCode ?? 'unknown'}`,
    `Summary: ${input.summary?.trim() || 'n/a'}`,
    `Crash report: ${input.crashReportPath ?? 'none'}`
  ]
  const lines = tail.map((l) => `[${utcClock(l.ts)}] [${l.level.toUpperCase()}] ${stripAnsi(l.text)}`)
  return [...header, '', `--- Last ${tail.length} console lines ---`, ...lines].join('\n')
}
