import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatEta,
  formatMemory,
  formatRelative,
  uuidWithDashes,
  uuidWithoutDashes
} from '@shared/format'

describe('format helpers', () => {
  it('formats bytes with sensible units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3.25 * 1024 ** 3, 2)).toBe('3.25 GB')
  })

  it('formats ETA', () => {
    expect(formatEta(null)).toBe('--')
    expect(formatEta(0.4)).toBe('a moment')
    expect(formatEta(42)).toBe('42s')
    expect(formatEta(125)).toBe('2m 05s')
    expect(formatEta(3700)).toBe('1h 01m')
  })

  it('formats durations and counts', () => {
    expect(formatDuration(30_000)).toBe('under a minute')
    expect(formatDuration(5 * 60_000)).toBe('5 min')
    expect(formatDuration(125 * 60_000)).toBe('2h 5m')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1500)).toBe('1.5K')
    expect(formatCount(2_400_000)).toBe('2.4M')
  })

  it('formats memory', () => {
    expect(formatMemory(512)).toBe('512 MB')
    expect(formatMemory(4096)).toBe('4 GB')
    expect(formatMemory(6144)).toBe('6 GB')
    expect(formatMemory(1536)).toBe('1.5 GB')
  })

  it('formats relative time', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    expect(formatRelative(null, now)).toBe('never')
    expect(formatRelative('2026-10-06T11:59:40Z', now)).toBe('just now')
    expect(formatRelative('2026-10-06T11:30:00Z', now)).toBe('30 min ago')
    expect(formatRelative('2026-10-05T12:00:00Z', now)).toBe('1d ago')
  })

  it('converts uuid formats', () => {
    const plain = '069a79f444e94726a5befca90e38aaf5'
    const dashed = '069a79f4-44e9-4726-a5be-fca90e38aaf5'
    expect(uuidWithDashes(plain)).toBe(dashed)
    expect(uuidWithoutDashes(dashed)).toBe(plain)
    expect(uuidWithDashes('nope')).toBe('nope')
  })
})
