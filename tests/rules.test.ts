import { describe, expect, it } from 'vitest'
import { type Rule } from '@shared/schemas/mojang'
import { launchFeatures, rulesAllow, type OsInfo } from '@main/minecraft/rules'

const windows: OsInfo = { name: 'windows', arch: 'x64', version: '10.0.26300' }
const windows7: OsInfo = { name: 'windows', arch: 'x64', version: '6.1.7601' }
const windowsX86: OsInfo = { name: 'windows', arch: 'x86', version: '10.0.19045' }
const mac: OsInfo = { name: 'osx', arch: 'arm64', version: '23.1.0' }
const linux: OsInfo = { name: 'linux', arch: 'x64', version: '6.8.0' }

describe('rulesAllow', () => {
  it('allows everything when there are no rules', () => {
    expect(rulesAllow(undefined, { os: windows })).toBe(true)
    expect(rulesAllow([], { os: linux })).toBe(true)
  })

  it('an allow rule scoped to an os only matches that os', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'osx' } }]
    expect(rulesAllow(rules, { os: mac })).toBe(true)
    expect(rulesAllow(rules, { os: windows })).toBe(false)
    expect(rulesAllow(rules, { os: linux })).toBe(false)
  })

  it('a later disallow overrides an earlier blanket allow', () => {
    const rules: Rule[] = [{ action: 'allow' }, { action: 'disallow', os: { name: 'windows' } }]
    expect(rulesAllow(rules, { os: windows })).toBe(false)
    expect(rulesAllow(rules, { os: linux })).toBe(true)
    expect(rulesAllow(rules, { os: mac })).toBe(true)
  })

  it('the last matching rule wins even when it re-allows', () => {
    const rules: Rule[] = [
      { action: 'allow' },
      { action: 'disallow', os: { name: 'linux' } },
      { action: 'allow', os: { name: 'linux', arch: 'x64' } }
    ]
    expect(rulesAllow(rules, { os: linux })).toBe(true)
    expect(rulesAllow(rules, { os: { ...linux, arch: 'arm64' } })).toBe(false)
  })

  it('matches on architecture', () => {
    const rules: Rule[] = [{ action: 'allow', os: { arch: 'x86' } }]
    expect(rulesAllow(rules, { os: windowsX86 })).toBe(true)
    expect(rulesAllow(rules, { os: windows })).toBe(false)
  })

  it('matches os.version as a regular expression', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', version: '^10\\.' } }]
    expect(rulesAllow(rules, { os: windows })).toBe(true)
    expect(rulesAllow(rules, { os: windows7 })).toBe(false)
    expect(rulesAllow(rules, { os: mac })).toBe(false)
  })

  it('treats an invalid regex as a non-match instead of throwing', () => {
    const rules: Rule[] = [{ action: 'allow', os: { version: '(' } }]
    expect(rulesAllow(rules, { os: windows })).toBe(false)
  })

  it('evaluates feature flags', () => {
    const resolution: Rule[] = [{ action: 'allow', features: { has_custom_resolution: true } }]
    expect(rulesAllow(resolution, { os: windows, features: launchFeatures({ fullscreen: false }) })).toBe(true)
    expect(rulesAllow(resolution, { os: windows, features: launchFeatures({ fullscreen: true }) })).toBe(false)

    const demo: Rule[] = [{ action: 'allow', features: { is_demo_user: true } }]
    expect(rulesAllow(demo, { os: windows, features: launchFeatures({ fullscreen: false }) })).toBe(false)
  })

  it('treats unknown features as false', () => {
    const rules: Rule[] = [{ action: 'allow', features: { some_future_feature: true } }]
    expect(rulesAllow(rules, { os: windows, features: launchFeatures({ fullscreen: false }) })).toBe(false)
    const negated: Rule[] = [{ action: 'allow', features: { some_future_feature: false } }]
    expect(rulesAllow(negated, { os: windows })).toBe(true)
  })

  it('requires every condition of a rule to match', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', arch: 'x86' } }]
    expect(rulesAllow(rules, { os: windows })).toBe(false)
    expect(rulesAllow(rules, { os: windowsX86 })).toBe(true)
  })
})
