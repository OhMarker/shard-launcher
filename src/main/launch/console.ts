/**
 * Per-instance console: a ring buffer of game output plus launcher-generated lines, emitted
 * to the renderer in 100 ms batches. Pure Node (no Electron) so it can be unit tested.
 */
import { StringDecoder } from 'node:string_decoder'
import { CONSOLE_BUFFER_LINES } from '@shared/constants'
import { type ConsoleLevel, type ConsoleLine, type ConsoleStream } from '@shared/types'

export const CRASH_MARKER = '---- Minecraft Crash Report ----'

/**
 * Startup failures that never produce a crash report. Fabric Loader, for example, shows a
 * Swing dialog and keeps the process alive, so without these the launcher would report
 * "running" forever.
 */
export const FATAL_PATTERNS: ReadonlyArray<{ re: RegExp; summary: string }> = [
  { re: /Incompatible mods found!/, summary: 'Incompatible mods found' },
  { re: /Mod resolution failed/, summary: 'Fabric could not resolve mod dependencies' },
  { re: /net\.fabricmc\.loader\.impl\.FormattedException/, summary: 'Fabric Loader failed to start' },
  { re: /Error: Could not find or load main class/, summary: 'Java could not find the game main class' },
  { re: /UnsupportedClassVersionError/, summary: 'The selected Java version is too old for this Minecraft version' },
  { re: /java\.lang\.OutOfMemoryError/, summary: 'Minecraft ran out of memory' },
  { re: /Could not reserve enough space for .* object heap/, summary: 'Not enough free memory for the configured heap size' }
]

/** Lines following a fatal line that Fabric indents as suggested fixes or details. */
const FATAL_DETAIL_RE = /^\s+-\s+(.+)$/
const MAX_FATAL_DETAILS = 6

export interface FatalInfo {
  summary: string
  details: string[]
}

const LEVEL_RE = /\/(INFO|WARN|ERROR|FATAL|DEBUG)\]/
const LEVELS: Record<string, ConsoleLevel> = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
  DEBUG: 'debug'
}
const FLUSH_INTERVAL_MS = 100

type GameStream = Exclude<ConsoleStream, 'launcher'>

export function detectLevel(text: string, stream: ConsoleStream): ConsoleLevel {
  const match = LEVEL_RE.exec(text)
  const level = match?.[1] ? LEVELS[match[1]] : undefined
  if (level) return level
  return stream === 'stderr' ? 'warn' : 'info'
}

export function detectFatal(text: string): string | null {
  for (const { re, summary } of FATAL_PATTERNS) if (re.test(text)) return summary
  return null
}

export function formatConsoleLine(line: ConsoleLine): string {
  return `[${new Date(line.ts).toISOString()}] [${line.stream}/${line.level.toUpperCase()}] ${line.text}`
}

export class InstanceConsole {
  private lines: ConsoleLine[] = []
  private pending: ConsoleLine[] = []
  private nextId = 1
  private timer: NodeJS.Timeout | null = null
  private readonly decoders: Record<GameStream, StringDecoder> = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8')
  }
  private readonly remainder: Record<GameStream, string> = { stdout: '', stderr: '' }
  private crashMarkerSeen = false
  private fatalInfo: FatalInfo | null = null
  private fatalListener: ((info: FatalInfo) => void) | null = null

  constructor(
    private readonly emit: (lines: ConsoleLine[]) => void,
    private readonly capacity = CONSOLE_BUFFER_LINES
  ) {}

  /** True once the game printed a crash report header since the last `resetCrashMarker()`. */
  get sawCrashMarker(): boolean {
    return this.crashMarkerSeen
  }

  /** Fatal startup error detected since the last `resetCrashMarker()`, if any. */
  get fatal(): FatalInfo | null {
    return this.fatalInfo
  }

  /** Registers a one-shot listener fired the first time a fatal startup error is seen. */
  onFatal(listener: (info: FatalInfo) => void): void {
    this.fatalListener = listener
  }

  resetCrashMarker(): void {
    this.crashMarkerSeen = false
    this.fatalInfo = null
    this.fatalListener = null
  }

  /** Feeds raw process output; complete lines are recorded, the tail waits for more data. */
  pushChunk(stream: GameStream, chunk: Buffer | string): void {
    const text = typeof chunk === 'string' ? chunk : this.decoders[stream].write(chunk)
    const data = this.remainder[stream] + text
    const parts = data.split(/\r?\n/)
    this.remainder[stream] = parts.pop() ?? ''
    for (const line of parts) this.add(stream, line)
  }

  /** Records any partial line left after the process closed its streams. */
  flushRemainder(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const tail = this.remainder[stream] + this.decoders[stream].end()
      this.remainder[stream] = ''
      if (tail.length) this.add(stream, tail)
    }
  }

  launcher(text: string, level: ConsoleLevel = 'info'): void {
    this.add('launcher', text, level)
  }

  get(after = 0): ConsoleLine[] {
    return after > 0 ? this.lines.filter((line) => line.id > after) : [...this.lines]
  }

  get size(): number {
    return this.lines.length
  }

  clear(): void {
    this.lines = []
    this.pending = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** Sends buffered lines to the renderer immediately. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    this.emit(batch)
  }

  toText(): string {
    return this.lines.map(formatConsoleLine).join('\n')
  }

  private add(stream: ConsoleStream, text: string, level: ConsoleLevel = detectLevel(text, stream)): void {
    if (text.includes(CRASH_MARKER)) this.crashMarkerSeen = true
    if (stream !== 'launcher') this.trackFatal(text)
    const line: ConsoleLine = { id: this.nextId++, ts: Date.now(), stream, level, text }
    this.lines.push(line)
    if (this.lines.length > this.capacity) this.lines.splice(0, this.lines.length - this.capacity)
    this.pending.push(line)
    this.timer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
  }

  private trackFatal(text: string): void {
    if (this.fatalInfo) {
      const detail = FATAL_DETAIL_RE.exec(text)?.[1]
      if (detail && this.fatalInfo.details.length < MAX_FATAL_DETAILS) this.fatalInfo.details.push(detail.trim())
      return
    }
    const summary = detectFatal(text)
    if (!summary) return
    this.fatalInfo = { summary, details: [] }
    const listener = this.fatalListener
    this.fatalListener = null
    if (listener) {
      // Give the process a moment to print the explanatory lines before anyone reacts.
      setTimeout(() => listener(this.fatalInfo ?? { summary, details: [] }), 1500)
    }
  }
}
