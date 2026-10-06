import { describe, expect, it } from 'vitest'
import { type ModrinthVersion } from '@shared/types'
import { acceptsUpdate, isPrereleaseNumber } from '@main/mods/update-policy'

function version(versionType: ModrinthVersion['versionType'], versionNumber: string): ModrinthVersion {
  return {
    id: versionNumber,
    projectId: 'p',
    name: versionNumber,
    versionNumber,
    changelog: null,
    datePublished: '2026-10-06T00:00:00Z',
    downloads: 0,
    versionType,
    gameVersions: ['26.3'],
    loaders: ['fabric'],
    files: [],
    dependencies: []
  }
}

describe('isPrereleaseNumber', () => {
  it('detects alpha/beta/rc/pre markers', () => {
    expect(isPrereleaseNumber('mc26.3-0.9.3-alpha.1-fabric')).toBe(true)
    expect(isPrereleaseNumber('1.2.0-beta.4')).toBe(true)
    expect(isPrereleaseNumber('2.0.0-rc1')).toBe(true)
    expect(isPrereleaseNumber('1.21.2-pre1')).toBe(true)
  })
  it('does not flag releases or words that merely contain the letters', () => {
    expect(isPrereleaseNumber('mc26.3-0.9.2-fabric')).toBe(false)
    expect(isPrereleaseNumber('0.162.0+26.3')).toBe(false)
    expect(isPrereleaseNumber('alphabet-1.0')).toBe(false)
    expect(isPrereleaseNumber(null)).toBe(false)
  })
})

describe('acceptsUpdate', () => {
  it('always accepts release-channel updates', () => {
    expect(acceptsUpdate('mc26.3-0.9.2-fabric', version('release', 'mc26.3-0.9.3-fabric'))).toBe(true)
    expect(acceptsUpdate(null, version('release', '1.0.0'))).toBe(true)
  })
  it('refuses to move a release install onto alpha or beta', () => {
    expect(acceptsUpdate('mc26.3-0.9.2-fabric', version('alpha', 'mc26.3-0.9.3-alpha.1-fabric'))).toBe(false)
    expect(acceptsUpdate('1.0.0', version('beta', '1.1.0-beta.1'))).toBe(false)
  })
  it('lets prerelease installs follow prereleases', () => {
    expect(acceptsUpdate('1.1.0-beta.1', version('beta', '1.1.0-beta.2'))).toBe(true)
    expect(acceptsUpdate('1.1.0-alpha.3', version('alpha', '1.1.0-alpha.4'))).toBe(true)
  })
})
