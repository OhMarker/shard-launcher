/** Crash report discovery and summarising. */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { type CrashReport } from '@shared/types'
import { CRASH_MARKER } from './console'

const MAX_CONTENT_BYTES = 64 * 1024
/** File timestamps can lag the launch by a moment on some file systems. */
const TIMESTAMP_SLACK_MS = 2000

export interface CrashReportFile {
  path: string
  mtimeMs: number
}

/** Crash report files modified at or after `since`, newest first. */
export async function findCrashReports(dir: string, since: number): Promise<CrashReportFile[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const found: CrashReportFile[] = []
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.txt')) continue
    const path = join(dir, name)
    try {
      const s = await stat(path)
      if (s.isFile() && s.mtimeMs >= since - TIMESTAMP_SLACK_MS) found.push({ path, mtimeMs: s.mtimeMs })
    } catch {
      // Deleted while we were listing; skip.
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return found
}

/** The `Description:` line, otherwise the first non-empty line after the header. */
export function summarizeCrashReport(content: string): string {
  const lines = content.split(/\r?\n/)
  const description = lines.find((line) => line.trim().startsWith('Description:'))
  if (description) {
    const value = description.trim().slice('Description:'.length).trim()
    if (value) return value
  }
  const header = lines.findIndex((line) => line.includes(CRASH_MARKER))
  for (let i = header + 1; i < lines.length; i++) {
    const text = lines[i]?.trim()
    if (text) return text
  }
  return 'Minecraft crashed'
}

export async function readCrashReport(path: string): Promise<CrashReport> {
  const raw = await readFile(path)
  const content = raw.subarray(0, MAX_CONTENT_BYTES).toString('utf8')
  return { path, content, summary: summarizeCrashReport(content) }
}
