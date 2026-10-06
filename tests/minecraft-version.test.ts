import { describe, expect, it } from 'vitest'
import {
  compareLooseSemver,
  compareReleaseVersions,
  filterSupportedVersions,
  isSupportedRelease,
  parseReleaseVersion,
  pickBuildForVersion
} from '@shared/minecraft-version'

const manifest = [
  { id: '26w03a', type: 'snapshot', releaseTime: '2026-01-21T14:00:00+00:00' },
  { id: '1.22.1', type: 'release', releaseTime: '2026-01-10T14:00:00+00:00' },
  { id: '1.22', type: 'release', releaseTime: '2025-12-02T14:00:00+00:00' },
  { id: '1.22-rc1', type: 'snapshot', releaseTime: '2025-11-28T14:00:00+00:00' },
  { id: '1.21.10', type: 'release', releaseTime: '2025-09-30T14:00:00+00:00' },
  { id: '1.21.4', type: 'release', releaseTime: '2024-12-03T10:00:00+00:00' },
  { id: '1.21.1', type: 'release', releaseTime: '2024-08-08T12:00:00+00:00' },
  { id: '1.21', type: 'release', releaseTime: '2024-06-13T08:00:00+00:00' },
  { id: '24w21b', type: 'snapshot', releaseTime: '2024-05-22T14:00:00+00:00' },
  { id: '1.20.6', type: 'release', releaseTime: '2024-04-29T12:00:00+00:00' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T12:00:00+00:00' },
  { id: '1.8.9', type: 'release', releaseTime: '2015-12-09T12:00:00+00:00' },
  { id: 'b1.7.3', type: 'old_beta', releaseTime: '2011-07-08T12:00:00+00:00' }
]

describe('parseReleaseVersion', () => {
  it('parses two and three part versions', () => {
    expect(parseReleaseVersion('1.21')).toEqual([1, 21, 0])
    expect(parseReleaseVersion('1.21.10')).toEqual([1, 21, 10])
    expect(parseReleaseVersion('2.0.1')).toEqual([2, 0, 1])
  })
  it('rejects snapshots and pre-releases', () => {
    expect(parseReleaseVersion('24w21b')).toBeNull()
    expect(parseReleaseVersion('1.21.2-pre1')).toBeNull()
    expect(parseReleaseVersion('1.22-rc1')).toBeNull()
  })
})

describe('compareReleaseVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareReleaseVersions('1.21.10', '1.21.9')).toBeGreaterThan(0)
    expect(compareReleaseVersions('1.21', '1.21.0')).toBe(0)
    expect(compareReleaseVersions('1.22', '1.21.10')).toBeGreaterThan(0)
    expect(compareReleaseVersions('1.20.6', '1.21')).toBeLessThan(0)
  })
})

describe('isSupportedRelease', () => {
  it('accepts 1.21 and everything after', () => {
    for (const id of ['1.21', '1.21.1', '1.21.10', '1.22', '1.23.4', '2.0']) expect(isSupportedRelease(id)).toBe(true)
  })
  it('rejects anything older than 1.21 and all snapshots', () => {
    for (const id of ['1.20.6', '1.20.1', '1.8.9', '1.12.2', '24w21b', '1.21.2-pre1']) expect(isSupportedRelease(id)).toBe(false)
  })
})

describe('filterSupportedVersions', () => {
  it('keeps only releases >= 1.21, newest first', () => {
    const out = filterSupportedVersions(manifest, { includeSnapshots: false }).map((v) => v.id)
    expect(out).toEqual(['1.22.1', '1.22', '1.21.10', '1.21.4', '1.21.1', '1.21'])
  })
  it('adds snapshots newer than the 1.21 release when asked', () => {
    const out = filterSupportedVersions(manifest, { includeSnapshots: true }).map((v) => v.id)
    expect(out).toEqual(['26w03a', '1.22.1', '1.22', '1.22-rc1', '1.21.10', '1.21.4', '1.21.1', '1.21'])
    expect(out).not.toContain('24w21b')
  })
  it('never includes old betas or releases before 1.21', () => {
    const out = filterSupportedVersions(manifest, { includeSnapshots: true }).map((v) => v.id)
    expect(out).not.toContain('b1.7.3')
    expect(out).not.toContain('1.20.6')
  })
  it('drops snapshots entirely when 1.21 is missing from the manifest', () => {
    const noBaseline = manifest.filter((v) => v.id !== '1.21')
    const out = filterSupportedVersions(noBaseline, { includeSnapshots: true }).map((v) => v.id)
    expect(out.every((id) => !id.includes('w') && !id.includes('rc'))).toBe(true)
  })
})

describe('pickBuildForVersion', () => {
  const builds = [
    { version: '1.0.0', minecraft: ['1.21', '1.21.1'] },
    { version: '1.1.0', minecraft: ['1.21.1', '1.21.4'] },
    { version: '1.1.0-beta.1', minecraft: ['1.21.4', '1.21.10'] }
  ]
  it('returns the newest build covering the version', () => {
    expect(pickBuildForVersion(builds, '1.21.1')?.version).toBe('1.1.0')
    expect(pickBuildForVersion(builds, '1.21')?.version).toBe('1.0.0')
  })
  it('prefers stable over prerelease of the same number', () => {
    expect(pickBuildForVersion(builds, '1.21.4')?.version).toBe('1.1.0')
  })
  it('returns null when nothing matches (client pending)', () => {
    expect(pickBuildForVersion(builds, '1.22')).toBeNull()
  })
})

describe('compareLooseSemver', () => {
  it('handles prerelease ordering', () => {
    expect(compareLooseSemver('1.1.0', '1.1.0-beta.1')).toBeGreaterThan(0)
    expect(compareLooseSemver('1.2.0', '1.10.0')).toBeLessThan(0)
    expect(compareLooseSemver('1.0', '1.0.0')).toBe(0)
  })
})
