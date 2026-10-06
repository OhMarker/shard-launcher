import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceConsole, detectFatal, detectLevel } from '@main/launch/console'

const FABRIC_FAILURE = [
  '[03:34:47] [main/INFO]: Loading Minecraft 26.3 with Fabric Loader 0.19.5',
  '[03:34:47] [main/WARN]: Mod resolution failed',
  '[03:34:47] [main/ERROR]: Incompatible mods found!',
  'net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible with the game or each other!',
  'A potential solution has been determined, this may resolve your problem:',
  "\t - Replace mod 'Sodium' (sodium) 0.9.3-alpha.1+mc26.3 with version 0.9.2+mc26.3.",
  'More details:',
  "\t - Mod 'Reese's Sodium Options' requires version 0.9.2+mc26.3 of mod 'Sodium'.",
  '\tat net.fabricmc.loader.impl.FormattedException.ofLocalized(FormattedException.java:51)'
]

describe('fatal startup detection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('recognises known fatal lines and ignores normal output', () => {
    expect(detectFatal('[main/ERROR]: Incompatible mods found!')).toBe('Incompatible mods found')
    expect(detectFatal('Exception in thread "main" java.lang.UnsupportedClassVersionError: x')).toMatch(/Java version/)
    expect(detectFatal('[Render thread/INFO]: Backend library: LWJGL version 3.3.3')).toBeNull()
    expect(detectLevel('[main/WARN]: Mod resolution failed', 'stdout')).toBe('warn')
  })

  it('captures the first fatal line plus Fabric suggested fixes, then notifies once', () => {
    const emitted: unknown[] = []
    const con = new InstanceConsole((lines) => emitted.push(...lines))
    const listener = vi.fn()
    con.onFatal(listener)
    con.pushChunk('stdout', `${FABRIC_FAILURE.join('\n')}\n`)

    expect(con.fatal?.summary).toBe('Fabric could not resolve mod dependencies')
    expect(con.fatal?.details).toHaveLength(2)
    expect(con.fatal?.details[0]).toContain("Replace mod 'Sodium'")
    expect(listener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1600)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ summary: 'Fabric could not resolve mod dependencies' })

    // Later fatal-looking lines do not re-trigger.
    con.pushChunk('stderr', 'java.lang.OutOfMemoryError: Java heap space\n')
    vi.advanceTimersByTime(2000)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(con.fatal?.summary).toBe('Fabric could not resolve mod dependencies')
  })

  it('resets with the crash marker state and ignores launcher lines', () => {
    const con = new InstanceConsole(() => undefined)
    con.launcher('Incompatible mods found! (quoting an earlier run)', 'info')
    expect(con.fatal).toBeNull()
    con.pushChunk('stdout', 'Mod resolution failed\n')
    expect(con.fatal).not.toBeNull()
    con.resetCrashMarker()
    expect(con.fatal).toBeNull()
    expect(con.sawCrashMarker).toBe(false)
  })
})
